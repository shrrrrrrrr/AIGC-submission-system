import ExcelJS from 'exceljs';
import { tableHeaders, tableRow, type TableSource } from './table.js';

export async function submissionWorkbook(rows: TableSource[]): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('投稿汇总', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
  sheet.columns = tableHeaders.map((header, i) => ({ header, width: [9, 10, 13, 14].includes(i) ? 55 : i >= 18 && i % 2 === 0 ? 50 : 25 }));
  for (const row of rows) {
    // Strings must remain text, including values beginning with '=' or '+'.
    const record = sheet.addRow(tableRow(row, true).cells);
    record.alignment = { vertical: 'top', wrapText: true };
  }
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B204B' } };
  sheet.getRow(1).height = 32;
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: tableHeaders.length } };
  const notes = workbook.addWorksheet('使用说明');
  notes.getColumn(1).width = 100;
  notes.addRows([['本表为导出时的数据快照，之后的新投稿请重新导出。'], ['仅包含已正式提交的作品；同一提交编号一行，未提交草稿不收录。'], ['身份信息采用账号邮箱；时间均为北京时间。'], ['链接以原始文本保留，核验状态单独列出；未核验不代表内容可访问或已通过审核。'], ['文件包含投稿者邮箱，分享时请仅提供给需要查阅的人员。']]);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
