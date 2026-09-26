import { isCurrentClass } from "./classOptions.ts";
import type { RosterStudent } from "./assessment";
export function csvText(rows: unknown[][]) {
  return (
    "\uFEFF" +
    rows
      .map(row =>
        row
          .map(value => {
            let text = String(value ?? "");
            if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text))
              text = "'" + text;
            return '"' + text.replaceAll('"', '""') + '"';
          })
          .join(",")
      )
      .join("\r\n")
  );
}
export function downloadCsv(filename: string, rows: unknown[][]) {
  const url = URL.createObjectURL(
    new Blob([csvText(rows)], { type: "text/csv;charset=utf-8" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (quoted || !field) quoted = !quoted;
      else throw new Error("CSV 引號格式不正確。");
    } else if (!quoted && (c === "," || c === "\n" || c === "\r")) {
      row.push(field);
      field = "";
      if (c !== ",") {
        if (row.some(x => x.trim())) rows.push(row);
        row = [];
        if (c === "\r" && text[i + 1] === "\n") i++;
      }
    } else field += c;
  }
  if (quoted) throw new Error("CSV 引號未結束。");
  row.push(field);
  if (row.some(x => x.trim())) rows.push(row);
  return rows;
}
export function parseRoster(text: string): RosterStudent[] {
  const [headers, ...rows] = parseCsv(text);
  if (!headers) throw new Error("名單是空白的。");
  const columns = ["班別", "學號", "姓名"].map((h, i) =>
    headers.findIndex(v =>
      [h, ["class_name", "student_no", "student_name"][i]].includes(v.trim())
    )
  );
  if (columns.some(i => i < 0))
    throw new Error("名單需包含：班別、學號、姓名。");
  if (!rows.length || rows.length > 2000)
    throw new Error("每次請匯入 1 至 2000 位學生。");
  const seen = new Set<string>();
  return rows.map((row, i) => {
    const [class_name, student_no, student_name] = columns.map(c =>
      (row[c] || "").trim()
    );
    if (
      !/^[A-Za-z0-9-]{1,20}$/.test(class_name) ||
      !/^[A-Za-z0-9-]{1,20}$/.test(student_no) ||
      !student_name ||
      student_name.length > 80
    )
      throw new Error(`第 ${i + 2} 行的班別、學號或姓名不正確。`);
    const key = `${class_name.toUpperCase()}:${student_no.toUpperCase()}`;
    if (seen.has(key))
      throw new Error(`第 ${i + 2} 行與之前的班別及學號重複。`);
    seen.add(key);
    return {
      class_name: class_name.toUpperCase(),
      student_no: student_no.toUpperCase(),
      student_name,
    };
  });
}

export type AccountRosterRow = { email: string; className: string; studentNo: string; name: string };
export function parseAccountRoster(text: string): AccountRosterRow[] {
  const [headers,...rows]=parseCsv(text);
  const labels=[['email','學校email','學校 email'],['班別','class_name'],['學號','student_no'],['姓名','student_name']];
  const columns=labels.map(names=>headers?.findIndex(h=>names.includes(h.trim().toLowerCase()))??-1);
  if(columns.includes(-1))throw new Error("CSV 必須包含 email、班別、學號、姓名。");
  if(!rows.length||rows.length>1000)throw new Error("每次請匯入 1 至 1000 人。");
  const emails=new Set<string>();const identities=new Set<string>();
  return rows.map((row,i)=>{
    const [rawEmail,rawClass,rawNo,name]=columns.map(c=>(row[c]||'').trim());
    const email=rawEmail.toLowerCase(),className=rawClass.toUpperCase()==="OTHER"?"Other":rawClass.toUpperCase(),studentNo=rawNo.toUpperCase();
    if(!/^[^/\s@]+@(ctshkpcc\.edu\.hk|gmail\.com)$/.test(email)||!isCurrentClass(className)||! /^[A-Z0-9-]{1,12}$/.test(studentNo)||name.length<2||name.length>50)throw new Error(`第 ${i+2} 行資料格式不正確。`);
    const key=`${className}:${studentNo}`;
    if(emails.has(email)||identities.has(key))throw new Error(`第 ${i+2} 行 email 或班別＋學號重複；請先核對。`);
    emails.add(email);identities.add(key);
    return {email,className,studentNo,name};
  });
}
