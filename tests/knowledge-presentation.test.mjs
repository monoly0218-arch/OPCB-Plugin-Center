import test from 'node:test';
import assert from 'node:assert/strict';
import {documentPreview,displayDate} from '../src/knowledge/presentation.mjs';

test('document snippets show content instead of recording headers and table markup',()=>{
  const text='### 智能总结\n\n#### 录音信息\n- **录音时间**：2026-11-13\n- **时长**：12 分钟\n- **参与人数**：3 人\n\n## 计划\n本周完成 **资料目录**，核对 [来源](https://example.com)。\n| 工作 | 状态 |\n| --- | --- |\n| 核对 | 待处理 |';
  assert.equal(documentPreview(text),'本周完成 资料目录，核对 来源。');
  assert.equal(documentPreview('### 空标题\n[图片]'),'');
  assert.equal(documentPreview('价格 < 100；未确认日期。'),'价格 < 100；未确认日期。');
});
test('missing source dates remain explicitly unknown in the document list',()=>{
  for(const date of [undefined,null,'','not-a-date'])assert.equal(displayDate(date),'时间未提供');
  assert.notEqual(displayDate('2026-11-13'),'时间未提供');
});
