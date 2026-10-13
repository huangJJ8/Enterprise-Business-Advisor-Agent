/**
 * 输出净化器
 *
 * 作用：为 prompts/system-prompt.ts 里那些「靠模型自觉遵守」的 P0 规则
 * 提供一层**确定性的代码兜底**，把"希望模型别这么写"变成"模型写了也会被改掉"。
 *
 * 覆盖的规则：
 *   - 禁止暴露数据来源与字段名（P0）：工具名 / 字段名 → 中文业务术语
 *   - 自定义标签必须闭合（P0）：`<go />` → `<go></go>`，流结束时补全未闭合标签
 *   - 回答风格（P2）：收敛中文之间被多敲出来的空格
 *
 * 设计要点 —— 流式安全：
 *   模型是逐 token 吐字的，`taxCreditRating` 完全可能被切在两个 chunk 之间
 *   （`taxCredit` + `Rating`），`字段` 也可能被切成 `字` + `段`。
 *   因此本类内部维护一个尾部缓冲，push() 只放行到"安全切分点"为止：
 *   - 切分点落在标识符中间 → 回退到标识符起点；
 *   - 切分点前出现话术模式起始锚点 → 回退到锚点之前；
 *   - 存在未闭合的 `<` → 从该位置起全部扣住。
 *   最后 flush() 冲刷剩余内容并补全未闭合标签。
 *
 * 设计要点 —— 不做的事：
 *   - 不碰 `<...>` 标签内部（含属性），只做标签本身的闭合修复。
 *     这样 `<g3 corpname="..." creditno="...">` 这类工具卡片属性天然免疫。
 *   - 不替换词典外的标识符，只记告警。宁可漏改也不改错。
 *   - 不改动 qrcode / report-card 等"应当保持原样"的标签。
 */

import {
  FIELD_NAME_GLOSSARY,
  INTERNAL_TERM_GLOSSARY,
  PAIRED_TAGS,
  TOOL_NAME_GLOSSARY,
} from './glossary';

/** 净化器需要的日志能力（与 LoggerService.warn 结构兼容） */
export interface SanitizerLogger {
  warn(message: string): void;
  log?(message: string): void;
}

/** 各类开关，默认全开 */
export interface OutputSanitizerOptions {
  /** 词典替换：工具名 / 字段名 → 中文业务术语 */
  replaceTerms?: boolean;
  /** 标签闭合修复：自闭合 → 配对、流结束时补全未闭合标签 */
  fixTagClosure?: boolean;
  /** 泄漏话术清理：删除"数据来源：X""根据X工具返回的数据，"等表述 */
  stripLeakPhrases?: boolean;
  /** 空白收敛：中文之间的多余空格 + 连排空行 */
  normalizeWhitespace?: boolean;
  /** 词典外的 camelCase 标识符告警（便于后续补词典） */
  warnUnknownIdentifiers?: boolean;
}

type ResolvedOptions = Required<OutputSanitizerOptions>;

/** 净化过程的统计，用于每轮请求结束后落一条日志 */
export interface SanitizerStats {
  /** 被替换的标识符 → 次数 */
  replacedTerms: Map<string, number>;
  /** 被清理的泄漏话术条数 */
  leakPhrasesStripped: number;
  /** 自闭合标签被改成配对写法的个数 */
  tagsFixed: number;
  /** 流结束时自动补全的闭合标签个数 */
  tagsAutoClosed: number;
  /** 词典未覆盖、疑似字段名的标识符 */
  unknownIdentifiers: Set<string>;
}

/** 流式处理器的构造参数 */
export interface OutputSanitizerConfig {
  logger?: SanitizerLogger;
  options?: OutputSanitizerOptions;
}

const DEFAULT_OPTIONS: ResolvedOptions = {
  replaceTerms: true,
  fixTagClosure: true,
  stripLeakPhrases: true,
  normalizeWhitespace: true,
  warnUnknownIdentifiers: true,
};

/**
 * 合并后的查询表。
 * 写入顺序即优先级：内部协议词 < 字段名 < 工具名。
 */
const GLOSSARY: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const source of [
    INTERNAL_TERM_GLOSSARY,
    FIELD_NAME_GLOSSARY,
    TOOL_NAME_GLOSSARY,
  ]) {
    for (const [key, value] of Object.entries(source)) {
      map.set(key, value);
    }
  }
  return map;
})();

/** 词典中最长的键，决定流式缓冲的扣留长度 */
const MAX_GLOSSARY_KEY_LENGTH = (() => {
  let max = 0;
  for (const key of GLOSSARY.keys()) {
    if (key.length > max) max = key.length;
  }
  return max;
})();

/** 匹配一个「标识符」：字母/下划线开头，仅含字母数字下划线 */
const IDENTIFIER_PATTERN = '[A-Za-z_][A-Za-z0-9_]*';

/** 匹配一个完整标签 */
const TAG_SOURCE = '</?[A-Za-z][^>]*>';

/** 中文标点，用于收敛空格 */
const CJK_PUNCT = '，。；：！？、）】》」』';

/** 泄漏话术模式。只做「删除」这种无歧义操作，不做改写，避免产出病句。 */
const LEAK_PHRASE_RULES: Array<{ label: string; pattern: string }> = [
  // 「数据来源：XX报告。」「以上数据均来源：XX。」
  // 这里的 [^...]{0,40} 必须**有上界**：无上界的 .* 会让"切分点回退"无法收敛。
  {
    label: '数据来源标注',
    pattern:
      '(?:以上|以下|下述|这些)?数据(?:均|都)?来源[:：][^\\n。；;]{0,40}[。；;]?',
  },
  // 「根据XX工具返回的数据，」「依据接口返回结果，」
  // 必须同时出现 工具/接口/API 才算技术表述，"根据工商信息"这类业务表述不会命中。
  {
    label: '工具来源表述',
    pattern:
      '(?:根据|依据|基于)[^\\n，,。；;！!？?]{0,24}?(?:工具|接口|API|api)[^\\n，,。；;！!？?]{0,12}?(?:返回|提供|查询|获取)?(?:的)?(?:数据|内容|结果|信息)?[，,]?',
  },
  // 「字段 taxCreditRating 为A」→ 去掉"字段"这层技术壳，标识符交给词典替换
  {
    label: '字段名标注前缀',
    pattern: '(?:字段名|字段|参数名|JSON\\s*key|接口字段)\\s*[:：]?\\s*',
  },
];

/**
 * 泄漏话术模式可能匹配的最长长度上界。
 * 需 ≥ 上面三条 pattern 的实际最大匹配长度（当前约 49），改动 pattern 时务必同步。
 */
const MAX_LEAK_PATTERN_LENGTH = 64;

/**
 * 回退扫描窗口。必须 ≥ MAX_LEAK_PATTERN_LENGTH。
 * 依据：若某个模式起点落在窗口之外，说明切分点已离它远于一个完整匹配，
 * 该匹配必然整体落在已放行区间内，可以安全放行。
 */
const BACKOFF_WINDOW = Math.max(96, MAX_LEAK_PATTERN_LENGTH);

/**
 * 各泄漏话术模式的起始锚点。
 * 窗口内一旦出现这些字串，就可能有一个模式正在匹配中，
 * 此时必须把切分点回退到锚点之前，否则模式的"前半截"会被当成普通文本放行。
 */
const LEAK_PHRASE_ANCHORS: readonly string[] = [
  '根据',
  '依据',
  '基于',
  '数据',
  '以上',
  '以下',
  '下述',
  '这些',
  '字段',
  '参数名',
  '接口',
  'JSON',
];

interface PipelineContext {
  options: ResolvedOptions;
  stats: SanitizerStats;
  tracker: TagBalanceTracker;
}

function createStats(): SanitizerStats {
  return {
    replacedTerms: new Map<string, number>(),
    leakPhrasesStripped: 0,
    tagsFixed: 0,
    tagsAutoClosed: 0,
    unknownIdentifiers: new Set<string>(),
  };
}

function resolveOptions(
  options?: OutputSanitizerOptions,
): ResolvedOptions {
  return { ...DEFAULT_OPTIONS, ...(options ?? {}) };
}

/**
 * 标签配对追踪器
 * 只追踪 PAIRED_TAGS 中的标签，避免误拉长 <br>、<qrcode /> 这类本就不成对的标签。
 */
class TagBalanceTracker {
  private stack: string[] = [];

  scan(text: string): void {
    const re = /<(\/?)([A-Za-z][\w-]*)([^>]*?)(\/?)>/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const isClosing = match[1] === '/';
      const name = match[2].toLowerCase();
      const isSelfClosing = match[4] === '/';

      if (!PAIRED_TAGS.has(name)) continue;
      if (isSelfClosing) continue;

      if (isClosing) {
        const index = this.stack.lastIndexOf(name);
        if (index !== -1) this.stack.length = index;
      } else {
        this.stack.push(name);
      }
    }
  }

  /** 取出仍未闭合的标签（由内到外），并清空状态 */
  drain(): string[] {
    const pending = this.stack.slice().reverse();
    this.stack = [];
    return pending;
  }
}

/** 把 `<go />` 改写为 `<go></go>`；不在配对白名单内则返回 null。 */
function fixSelfClosingTag(tag: string): string | null {
  const match = /^<([A-Za-z][\w-]*)\s*([\s\S]*?)\s*\/>$/.exec(tag);
  if (!match) return null;

  const name = match[1];
  if (!PAIRED_TAGS.has(name.toLowerCase())) return null;

  const attributes = match[2].trim();
  return `<${name}${attributes ? ` ${attributes}` : ''}></${name}>`;
}

/** 判断一个标识符是否"长得像字段名"（camelCase 且足够长） */
function looksLikeFieldName(token: string): boolean {
  if (token.length < 6) return false;
  return /[a-z][A-Z]/.test(token);
}

function applyLeakPhraseRules(text: string, ctx: PipelineContext): string {
  let result = text;
  for (const rule of LEAK_PHRASE_RULES) {
    const re = new RegExp(rule.pattern, 'g');
    result = result.replace(re, () => {
      ctx.stats.leakPhrasesStripped += 1;
      return '';
    });
  }
  return result;
}

function applyGlossary(text: string, ctx: PipelineContext): string {
  const re = new RegExp(IDENTIFIER_PATTERN, 'g');
  return text.replace(re, (token: string) => {
    const replacement = GLOSSARY.get(token);
    if (replacement !== undefined) {
      ctx.stats.replacedTerms.set(
        token,
        (ctx.stats.replacedTerms.get(token) ?? 0) + 1,
      );
      return replacement;
    }
    if (ctx.options.warnUnknownIdentifiers && looksLikeFieldName(token)) {
      ctx.stats.unknownIdentifiers.add(token);
    }
    return token;
  });
}

/**
 * 空白收敛
 *   1. 中文之间被多敲出的空格（"纳税信用等级 为A" → "纳税信用等级为A"）；
 *   2. 删除泄漏话术后可能留下的连排空行（3 个以上换行收敛为 2 个，
 *      正好对上提示词里"换行必须用 \n\n 双换行符"的要求）。
 * 不动单个换行，也不动 `\n\n`，所以不影响引导按钮的分隔。
 */
function normalizeWhitespace(text: string): string {
  return text
    .replace(new RegExp(`([\\u4e00-\\u9fff])[ \\t]+(?=[\\u4e00-\\u9fff])`, 'g'), '$1')
    .replace(
      new RegExp(`([\\u4e00-\\u9fff])[ \\t]+(?=[${CJK_PUNCT}])`, 'g'),
      '$1',
    )
    .replace(/\n{3,}/g, '\n\n');
}

/** 处理标签之外的普通文本 */
function processPlainText(text: string, ctx: PipelineContext): string {
  if (!text) return '';

  let result = text;
  if (ctx.options.stripLeakPhrases) {
    result = applyLeakPhraseRules(result, ctx);
  }
  if (ctx.options.replaceTerms) {
    result = applyGlossary(result, ctx);
  }
  if (ctx.options.normalizeWhitespace) {
    result = normalizeWhitespace(result);
  }
  return result;
}

/** 处理一个完整标签 */
function processTag(tag: string, ctx: PipelineContext): string {
  let result = tag;
  if (ctx.options.fixTagClosure) {
    const fixed = fixSelfClosingTag(tag);
    if (fixed !== null) {
      result = fixed;
      ctx.stats.tagsFixed += 1;
    }
  }
  ctx.tracker.scan(result);
  return result;
}

/**
 * 找出"可能是未闭合标签"的起点。
 * 逻辑：最后一个 `>` 之后的第一个 `<`，其后的内容有可能是还没收完的标签。
 * 返回 rest.length 表示整段都是安全的普通文本。
 */
function findOpenTagStart(text: string): number {
  const lastGt = text.lastIndexOf('>');
  const start = text.indexOf('<', lastGt + 1);
  return start === -1 ? text.length : start;
}

/**
 * 核心管线：按标签切分，标签内原样保留，标签外做净化。
 *
 * @param final 是否为"最后一段"。传 false 时，末尾疑似未闭合的标签会原样透传，
 *   等下一轮再处理；传 true（flush / 一次性净化）时，末尾残片一定是最终文本，
 *   按普通文本净化——否则 `3 < 5 且 taxNo 是A` 这种含裸 `<` 的句子会整体跳过净化。
 */
function runPipeline(
  text: string,
  ctx: PipelineContext,
  final: boolean,
): string {
  if (!text) return '';

  const tagRe = new RegExp(TAG_SOURCE, 'g');
  let output = '';
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(text)) !== null) {
    if (match.index > cursor) {
      output += processPlainText(text.slice(cursor, match.index), ctx);
    }
    output += processTag(match[0], ctx);
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    const rest = text.slice(cursor);
    if (final) {
      output += processPlainText(rest, ctx);
    } else {
      const openTagStart = findOpenTagStart(rest);
      output +=
        processPlainText(rest.slice(0, openTagStart), ctx) +
        rest.slice(openTagStart);
    }
  }

  return output;
}

/**
 * 一次性净化（非流式场景 / 测试用）
 */
export function sanitizeText(
  text: string,
  options?: OutputSanitizerOptions,
): string {
  if (!text) return '';

  const ctx: PipelineContext = {
    options: resolveOptions(options),
    stats: createStats(),
    tracker: new TagBalanceTracker(),
  };

  let output = runPipeline(text, ctx, true);

  if (ctx.options.fixTagClosure) {
    const pending = ctx.tracker.drain();
    if (pending.length > 0) {
      ctx.stats.tagsAutoClosed += pending.length;
      output += pending.map((name) => `</${name}>`).join('');
    }
  }

  return output;
}

/**
 * 流式输出净化器
 *
 * 用法：
 *   const sanitizer = new OutputSanitizer({ logger });
 *   for (const chunk of stream) emit(sanitizer.push(chunk));
 *   emit(sanitizer.flush());   // 必须调用，否则尾部缓冲会丢失
 */
export class OutputSanitizer {
  private buffer = '';

  private readonly options: ResolvedOptions;

  private readonly tracker = new TagBalanceTracker();

  private readonly stats = createStats();

  private readonly logger?: SanitizerLogger;

  /**
   * 尾部扣留长度。
   * 这只是**兜底余量**，真正防止"标识符被切断"的是 computeReleaseLength()
   * 里的标识符边界回退与话术锚点回退。
   */
  private readonly holdback: number;

  constructor(config: OutputSanitizerConfig = {}) {
    this.options = resolveOptions(config.options);
    this.logger = config.logger;
    this.holdback = this.options.replaceTerms
      ? Math.max(0, MAX_GLOSSARY_KEY_LENGTH - 1)
      : 0;
  }

  /**
   * 送入一段模型输出，返回"当前可以安全下发"的净化结果。
   * 可能返回空字符串（尾部还在缓冲中），这是正常的。
   */
  push(chunk: string): string {
    if (!chunk) return '';

    this.buffer += chunk;

    const releaseLength = this.computeReleaseLength();
    if (releaseLength <= 0) return '';

    const release = this.buffer.slice(0, releaseLength);
    this.buffer = this.buffer.slice(releaseLength);

    return runPipeline(release, this.context(), false);
  }

  /**
   * 冲刷尾部缓冲。流自然结束时**必须**调用，
   * 否则缓冲里最后一段内容会丢失、未闭合标签也不会被补全。
   */
  flush(): string {
    let output = '';

    if (this.buffer) {
      output = runPipeline(this.buffer, this.context(), true);
      this.buffer = '';
    }

    if (this.options.fixTagClosure) {
      const pending = this.tracker.drain();
      if (pending.length > 0) {
        this.stats.tagsAutoClosed += pending.length;
        output += pending.map((name) => `</${name}>`).join('');
      }
    }

    // 词典未覆盖的可疑标识符需要人工补词表，单独告警一次
    if (this.stats.unknownIdentifiers.size > 0) {
      this.logger?.warn(
        `输出净化遇到词典未覆盖的可疑标识符，请确认是否需要补充 glossary：${[
          ...this.stats.unknownIdentifiers,
        ].join('、')}`,
      );
    }

    return output;
  }

  /** 本轮净化统计，用于日志留痕 */
  getStats(): SanitizerStats {
    return this.stats;
  }

  /** 是否发生了任何净化动作 */
  hasFindings(): boolean {
    return (
      this.stats.replacedTerms.size > 0 ||
      this.stats.leakPhrasesStripped > 0 ||
      this.stats.tagsFixed > 0 ||
      this.stats.tagsAutoClosed > 0 ||
      this.stats.unknownIdentifiers.size > 0
    );
  }

  /** 生成一行可读的统计摘要（不含"词典未覆盖"告警，那条走 logger.warn） */
  report(): string {
    const parts: string[] = [];

    if (this.stats.replacedTerms.size > 0) {
      let total = 0;
      const details: string[] = [];
      for (const [key, count] of this.stats.replacedTerms) {
        total += count;
        details.push(`${key}×${count}`);
      }
      parts.push(`术语替换 ${total} 处（${details.join('、')}）`);
    }
    if (this.stats.leakPhrasesStripped > 0) {
      parts.push(`清理泄漏话术 ${this.stats.leakPhrasesStripped} 处`);
    }
    if (this.stats.tagsFixed > 0) {
      parts.push(`修复自闭合标签 ${this.stats.tagsFixed} 个`);
    }
    if (this.stats.tagsAutoClosed > 0) {
      parts.push(`补全未闭合标签 ${this.stats.tagsAutoClosed} 个`);
    }

    return parts.join('；');
  }

  private context(): PipelineContext {
    return {
      options: this.options,
      stats: this.stats,
      tracker: this.tracker,
    };
  }

  /**
   * 计算当前缓冲中可以安全放行的长度。
   *
   * 三类边界依次收紧，反复迭代直到稳定：
   *   a. 标签边界 —— 切分点落在标签内部时回退到标签起点。
   *      这条最关键：把 `</line>` 切成 `</li` + `ne>` 会让闭合标签既没被修复、
   *      也没被配对追踪，最后凭空多补一个 `</line>`；
   *   b. 标识符边界 —— 切分点若落在标识符中间，回退到标识符起点，
   *      防止 `taxCreditRating` 被切成 `taxCred` + `itRating` 而躲过词典；
   *   c. 话术锚点 —— 切分点前若出现模式起始锚点，回退到锚点之前，
   *      防止 `字段 taxCreditRating` 被从中间切开导致"字段"这条规则失效。
   *
   * 返回 0 是正常情况（本段还在缓冲中），不代表出错。
   */
  private computeReleaseLength(): number {
    let safe = this.buffer.length - this.holdback;
    if (safe <= 0) return 0;

    // 三条边界相互影响（回退后可能又落进另一个标签），因此迭代到稳定为止
    for (let guard = 0; guard < 8; guard += 1) {
      const before = safe;

      safe = Math.min(safe, this.tagBoundary(safe));
      if (safe <= 0) return 0;

      safe = Math.min(safe, this.identifierBoundary(safe));
      if (safe <= 0) return 0;

      safe = this.anchorBoundary(safe);

      if (safe === before) break;
    }

    return safe > 0 ? safe : 0;
  }

  /**
   * 标签边界：position 若落在某个标签内部，返回该标签的起始下标。
   * 顺带覆盖了"末尾标签尚未收完"的情况——此时找不到 `>`，同样回退。
   */
  private tagBoundary(position: number): number {
    if (position <= 0) return 0;

    const lastLt = this.buffer.lastIndexOf('<', position - 1);
    if (lastLt === -1) return position;

    const gt = this.buffer.indexOf('>', lastLt);
    if (gt === -1 || gt >= position) return lastLt;

    return position;
  }

  /** 若 position 前一个字符仍属于标识符，返回该标识符的起始下标 */
  private identifierBoundary(position: number): number {
    if (position <= 0) return 0;
    if (!/[A-Za-z0-9_]/.test(this.buffer[position - 1])) return position;

    let index = position - 1;
    while (index > 0 && /[A-Za-z0-9_]/.test(this.buffer[index - 1])) {
      index -= 1;
    }
    return index;
  }

  /** 把切分点回退到窗口内最靠后的锚点之前 */
  private anchorBoundary(position: number): number {
    let safe = position;

    // 设定迭代上限，避免锚点密集时过度回退
    for (let guard = 0; guard < 16; guard += 1) {
      const windowStart = Math.max(0, safe - BACKOFF_WINDOW);
      let found = -1;

      for (let i = safe - 1; i >= windowStart && found === -1; i -= 1) {
        for (const anchor of LEAK_PHRASE_ANCHORS) {
          if (this.buffer.startsWith(anchor, i)) {
            found = i;
            break;
          }
        }
      }

      if (found === -1) return safe;
      if (found === 0) return 0;
      safe = found;
    }

    return safe;
  }
}
