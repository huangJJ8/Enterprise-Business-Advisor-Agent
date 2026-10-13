import { Injectable, Inject } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

import { marked } from 'marked';
import { LoggerService } from 'src/modules-global/logger/service';
import { UploadConfig } from '../config/upload.config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const HTMLtoDOCX = require('html-to-docx');

/**
 * DocxService
 * 将 markdown 文本转换为 Word (.docx) 文件，存储到本地
 * 流程：markdown → marked 转 HTML → html-to-docx 转 docx buffer → 写文件
 */
@Injectable()
export class DocxService {
  @Inject(LoggerService)
  private readonly logger!: LoggerService;

  private readonly outputDir: string;

  constructor(private readonly uploadConfig: UploadConfig) {
    this.outputDir = path.join(this.uploadConfig.uploadTempDir, '..', 'reports');
  }

  /**
   * 将 markdown 文本生成 docx 文件
   * @param content LLM 输出的报告文本（markdown 格式）
   * @param fileName 文件名（不含扩展名）
   * @returns docx 文件的绝对路径和 HTML 预览内容
   */
  async generateDocx(content: string, fileName: string): Promise<{ docxPath: string; htmlContent: string }> {
    await fs.mkdir(this.outputDir, { recursive: true });

    const filePath = path.join(this.outputDir, `${fileName}.docx`);

    // 1. markdown → HTML
    const htmlBody = marked.parse(content);

    // 2. 包装完整 HTML（含中文字体样式）
    const fullHtml = this.wrapHtml(htmlBody);

    this.logger.log(`fullHtml 文档生成完成: ${fullHtml}`);

    // 3. HTML → docx buffer
    const docxBuffer = await HTMLtoDOCX(fullHtml, null, {
      table: { row: { cantSplit: true } },
      footer: false,
      pageNumber: false,
    });

    // 4. 写入文件
    await fs.writeFile(filePath, Buffer.from(docxBuffer));

    this.logger.log(`Word 文档生成完成: ${filePath}`);
    return { docxPath: filePath, htmlContent: fullHtml };
  }

  /**
   * 包装 HTML body，添加基础样式（字体、行距等）
   */
  private wrapHtml(body: string): string {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    font-family: "Microsoft YaHei", "SimSun", sans-serif;
    font-size: 12pt;
    line-height: 1.8;
    color: #333;
  }
  h1 { font-size: 20pt; color: #1a1a1a; margin-top: 16pt; margin-bottom: 8pt; }
  h2 { font-size: 16pt; color: #333; margin-top: 14pt; margin-bottom: 6pt; }
  h3 { font-size: 14pt; color: #444; margin-top: 12pt; margin-bottom: 4pt; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; }
  th, td { border: 1px solid #999; padding: 6pt 8pt; text-align: left; }
  th { background-color: #f0f0f0; font-weight: bold; }
  ul, ol { padding-left: 24pt; }
  li { margin-bottom: 4pt; }
  code { background-color: #f5f5f5; padding: 2pt 4pt; font-family: Consolas, monospace; }
  pre { background-color: #f5f5f5; padding: 8pt; overflow-x: auto; }
  blockquote { border-left: 3pt solid #ccc; padding-left: 12pt; color: #666; margin: 8pt 0; }
</style>
</head>
<body>${body}</body>
</html>`;
  }
}
