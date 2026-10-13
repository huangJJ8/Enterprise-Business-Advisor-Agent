/**
 * 输出净化器单元测试
 *
 * 重点验证两件事：
 * 1. 净化行为本身正确（术语替换、标签闭合、标签保护、话术清理）；
 * 2. **流式等价性** —— 无论模型按什么粒度分块吐字，净化结果都必须与一次性净化完全相同。
 *    第 2 点是这个模块最容易出错的地方：标识符和标签都可能被 chunk 边界切断。
 */

import {
  OutputSanitizer,
  OutputSanitizerOptions,
  sanitizeText,
} from './output-sanitizer';

/** 按给定分块喂给流式净化器，返回完整输出 */
function streamWith(
  chunks: string[],
  options?: OutputSanitizerOptions,
): string {
  const sanitizer = new OutputSanitizer({ options });
  let output = '';
  for (const chunk of chunks) {
    output += sanitizer.push(chunk);
  }
  return output + sanitizer.flush();
}

/** 固定长度切分 */
function splitEvery(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

/** 可复现的伪随机数发生器，保证测试失败可复现 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 随机长度切分 */
function splitRandom(
  text: string,
  random: () => number,
  maxChunk: number,
): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const size = 1 + Math.floor(random() * maxChunk);
    chunks.push(text.slice(i, i + size));
    i += size;
  }
  return chunks;
}

describe('输出净化 · 术语替换', () => {
  it('把工具名换成中文业务术语', () => {
    expect(sanitizeText('该结果来自 query_orders 工具的返回。')).toBe(
      '该结果来自订单查询工具的返回。',
    );
  });

  it('把字段名换成中文业务术语', () => {
    expect(sanitizeText('字段 taxCreditRating 为A。')).toBe(
      '纳税信用等级为A。',
    );
  });

  it('一次回答中出现多个标识符时全部替换', () => {
    expect(
      sanitizeText('字段 taxNo 为A，另一字段 enterpriseName 为示例公司。'),
    ).toBe('纳税人识别号为A，另一企业名称为示例公司。');
  });

  it('词典外的标识符保持原样，只记录告警', () => {
    const sanitizer = new OutputSanitizer();
    const output = sanitizer.push('参数 someUnknownFieldX 需要确认。');
    const tail = sanitizer.flush();

    expect(output + tail).toBe('参数 someUnknownFieldX 需要确认。');
    expect([...sanitizer.getStats().unknownIdentifiers]).toEqual([
      'someUnknownFieldX',
    ]);
  });
});

describe('输出净化 · 泄漏话术清理', () => {
  it('删除"根据X工具返回的数据，"这类来源表述', () => {
    expect(
      sanitizeText('根据 query_orders 工具返回的数据，以下是为您整理的订单列表。'),
    ).toBe('以下是为您整理的订单列表。');
  });

  it('删除"数据来源：X"标注', () => {
    expect(sanitizeText('该企业经营稳健。以上数据来源：示例银行风控报告。')).toBe(
      '该企业经营稳健。',
    );
  });

  it('业务口径的表述不受影响', () => {
    const text = '根据工商信息，该企业经营正常。';
    expect(sanitizeText(text)).toBe(text);
  });
});

describe('输出净化 · 标签处理', () => {
  it('把自闭合标签改成配对写法', () => {
    expect(sanitizeText('请您过目。<line />')).toBe('请您过目。<line></line>');
  });

  it('流结束时补全未闭合标签', () => {
    expect(sanitizeText('<top20><go>企业A</go>')).toBe(
      '<top20><go>企业A</go></top20>',
    );
  });

  it('标签属性完全保留，不做任何替换', () => {
    const card =
      '<g3 input="查看订单" corpname="示例科技有限公司" creditno="91310000MA1K3XYZ8P" status="已采集"></g3>';
    expect(sanitizeText(card)).toBe(card);
  });

  it('qrcode 保持自闭合，且不会被补上闭合标签', () => {
    const tag = '<qrcode url="https://example.com/qr"/>';
    expect(sanitizeText(`扫码关注：${tag}`)).toBe(`扫码关注：${tag}`);
  });

  it('工具返回的协议标签原样透传', () => {
    const html =
      '<report-card><pages>1</pages><generatereport /></report-card>';
    expect(sanitizeText(html)).toBe(html);
  });

  it('标签内容仍然会被净化', () => {
    expect(sanitizeText('<go>report_interp</go>')).toBe('<go>报告解读</go>');
  });

  it('裸小于号之后的文本依然会被净化', () => {
    expect(sanitizeText('该企业增速 < 5%，字段 taxNo 为A。')).toBe(
      '该企业增速 < 5%，纳税人识别号为A。',
    );
  });
});

describe('输出净化 · 空白收敛', () => {
  it('收敛中文之间多余的空格', () => {
    expect(sanitizeText('纳税信用等级 为A。')).toBe('纳税信用等级为A。');
  });

  it('把连排空行收敛为双换行', () => {
    expect(sanitizeText('第一段。\n\n\n\n第二段。')).toBe('第一段。\n\n第二段。');
  });

  it('不改变正常的双换行分隔', () => {
    const text = '内容如下。\n\n<g1 input="查看详情">查看详情</g1>';
    expect(sanitizeText(text)).toBe(text);
  });
});

describe('输出净化 · 开关', () => {
  const input = '字段 taxNo 为A。<go />';

  it('全部关闭时原样返回', () => {
    expect(
      sanitizeText(input, {
        replaceTerms: false,
        fixTagClosure: false,
        stripLeakPhrases: false,
        normalizeWhitespace: false,
      }),
    ).toBe(input);
  });

  it('只开术语替换时只做替换', () => {
    expect(
      sanitizeText(input, {
        fixTagClosure: false,
        stripLeakPhrases: false,
        normalizeWhitespace: false,
      }),
    ).toBe('字段 纳税人识别号 为A。<go />');
  });
});

describe('输出净化 · 统计', () => {
  it('记录替换次数与话术清理次数，并给出可读摘要', () => {
    const sanitizer = new OutputSanitizer();
    sanitizer.push('字段 taxNo 为A。');
    sanitizer.flush();

    const stats = sanitizer.getStats();
    expect(stats.replacedTerms.get('taxNo')).toBe(1);
    expect(stats.leakPhrasesStripped).toBe(1);
    expect(sanitizer.report()).toContain('术语替换 1 处');
    expect(sanitizer.report()).toContain('taxNo×1');
  });

  it('没有净化动作时摘要为空', () => {
    const sanitizer = new OutputSanitizer();
    sanitizer.push('该企业经营正常。');
    sanitizer.flush();
    expect(sanitizer.report()).toBe('');
    expect(sanitizer.hasFindings()).toBe(false);
  });
});

describe('输出净化 · 幂等性', () => {
  const samples = [
    '<g3 input="查看订单" corpname="示例公司" creditno="91310000MA1K3XYZ8P" status="已采集"></g3>',
    '字段 taxCreditRating 为A。\n\n<line></line>',
    '<top20><go>企业A</go></top20>',
    '<qrcode url="https://example.com/qr"/>',
  ];

  it.each(samples)('二次净化不改变结果: %s', (sample) => {
    const once = sanitizeText(sample);
    expect(sanitizeText(once)).toBe(once);
  });
});

/**
 * 流式等价性：这是本模块最核心的回归防线。
 * 分块粒度覆盖 1（逐字符，最极端）到 37，另加 200 次随机分块。
 */
const STREAM_CASES: Array<[string, string]> = [
  [
    '工具名 + 来源话术',
    '根据 query_orders 工具返回的数据，以下是为您整理的订单列表。',
  ],
  [
    '字段名被跨 chunk 切断',
    '该企业的字段 taxCreditRating 为A，字段 invoiceAmount 为1200万元。',
  ],
  ['数据来源标注', '该企业经营整体稳健。以上数据来源：示例银行风控报告。'],
  [
    '标签属性保护',
    '<g3 input="查看订单" corpname="示例科技有限公司" creditno="91310000MA1K3XYZ8P" status="已采集"></g3>',
  ],
  [
    '自闭合标签修复',
    '已完成，请您过目。<line />您可能还想了解：\n\n<g1 input="查看详情" />',
  ],
  ['qrcode 保持自闭合', '扫码关注：<qrcode url="https://example.com/qr"/>'],
  ['未闭合标签补全', '<top20><go>企业A</go><go>企业B</go>'],
  ['裸小于号', '该企业增速 < 5%，字段 taxNo 为 91310000MA1K3XYZ8P。'],
  [
    '工具协议标签',
    '<report-card><pages>1</pages><generatereport /></report-card>',
  ],
  [
    '多标签 + 换行 + 引导',
    '信息已整理好<line></line>\n\n企业列表如下。\n\n<g1 input="查看风险详情">查看风险详情</g1>',
  ],
  [
    '真实回答（混合场景）',
    [
      '好的，已经帮您查到了<line></line>',
      '',
      '以下是为您整理的订单列表：',
      '',
      '<g3 input="查看示例科技有限公司报告解读" corpname="示例科技有限公司" creditno="91310000MA1K3XYZ8P" status="已采集"></g3>',
      '',
      '根据 report_interp 工具返回的数据，该企业字段 taxCreditRating 为A，字段 invoiceAmount 为1200万元。',
      '以上数据来源：示例银行风控报告。',
      '',
      '<line></line>',
      '',
      '<g1 input="查看报告解读">查看报告解读</g1>',
    ].join('\n'),
  ],
];

describe.each(STREAM_CASES)('输出净化 · 流式等价性 [%s]', (_name, input) => {
  const expected = sanitizeText(input);

  it.each([1, 2, 3, 5, 8, 13, 37])(
    '按 %i 字符固定分块结果一致',
    (size) => {
      expect(streamWith(splitEvery(input, size))).toBe(expected);
    },
  );

  it('200 次随机分块（1~5 字符）结果一致', () => {
    const random = mulberry32(20261012);
    for (let round = 0; round < 200; round += 1) {
      expect(streamWith(splitRandom(input, random, 5))).toBe(expected);
    }
  });
});
