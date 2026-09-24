/** History Quest teaching API v2. Configure Script Properties before deployment.
 * HQ_SPREADSHEET_ID: existing private score spreadsheet
 * HQ_PIN_SHA256: SHA-256 hex digest of the teacher PIN (never commit the PIN)
 * HQ_PIN_SALT: optional salt for a migrated PIN; existing PIN remains unchanged.
 * New data uses HQ_ prefixed sheets. Existing task sheets are read, never rewritten.
 */
function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    if (params.action === "admin") {
      hqAuth(params.pin || "");
      var groups = {};
      hqAdmin().rows.forEach(function (row) {
        if (params.task_id && params.task_id !== row.task_id) return;
        if (!Object.prototype.hasOwnProperty.call(groups, row.task_id))
          Object.defineProperty(groups, row.task_id, {
            value: [],
            enumerable: true,
          });
        groups[row.task_id].push(row);
      });
      return hqJson({
        ok: true,
        api_version: 2,
        generated_at: new Date().toISOString(),
        tasks: Object.keys(groups).map(function (id) {
          return { task_id: id, count: groups[id].length, rows: groups[id] };
        }),
      });
    }
    return hqJson({
      ok: true,
      api_version: 2,
      version: "2.1.0",
      service: "History Quest Teaching API",
      legacy_compatible: true,
    });
  } catch (error) {
    return hqJson({ ok: false, api_version: 2, message: error.message });
  }
}
function doPost(e) {
  var lock;
  try {
    var text = e && e.postData && e.postData.contents;
    if (!text || text.length > 1000000) throw new Error("請求內容過大或空白。");
    var body = JSON.parse(text);
    var legacy = body.api_version === undefined && body.action === undefined;
    if (body.api_version !== 2 && !legacy)
      throw new Error("網站版本已更新，請重新整理後再提交。");
    if (legacy) {
      if (
        !Number.isFinite(Number(body.progress)) ||
        Number(body.progress) < 0 ||
        Number(body.progress) > 100
      )
        throw new Error("進度格式不正確。");
      body.action = "legacy_submit";
      body.score = Number(body.score);
    }
    var action = body.action;
    if (["admin", "catalogue", "roster", "grade"].indexOf(action) !== -1)
      hqAuth(body.pin);
    else if (["submit", "legacy_submit", "result"].indexOf(action) === -1)
      throw new Error("不支援此操作。");
    lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) throw new Error("系統忙碌，請稍後重試。");
    var result;
    if (
      legacy &&
      hqAdmin().rows.some(function (row) {
        return row.attempt_id === body.attempt_id;
      })
    )
      return hqJson({
        ok: true,
        api_version: 2,
        attempt_id: body.attempt_id,
        duplicate: true,
      });
    if (action === "admin") result = hqAdmin();
    if (action === "catalogue") result = hqCatalogue(body.tasks);
    if (action === "roster") result = hqRoster(body);
    if (action === "grade") result = hqGrade(body);
    if (action === "submit" || action === "legacy_submit")
      result = hqSubmit(body);
    if (action === "result") result = hqResult(body);
    return hqJson(Object.assign({ ok: true, api_version: 2 }, result));
  } catch (error) {
    return hqJson({
      ok: false,
      api_version: 2,
      message: error.message || "服務暫時未能使用。",
    });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}
function hqJson(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON
  );
}
function hqHash(text) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(text),
    Utilities.Charset.UTF_8
  )
    .map(function (b) {
      return ("0" + (b & 255).toString(16)).slice(-2);
    })
    .join("");
}
function hqAuth(pin) {
  var properties = PropertiesService.getScriptProperties();
  var expected = properties.getProperty("HQ_PIN_SHA256");
  var salt = properties.getProperty("HQ_PIN_SALT") || "";
  if (!expected || !/^[a-f0-9]{64}$/i.test(expected))
    throw new Error("教師驗證尚未設定。");
  var cache = CacheService.getScriptCache(),
    key = "pin-" + hqHash(String(pin));
  if (Number(cache.get(key) || 0) >= 5)
    throw new Error("此 PIN 嘗試次數過多，請稍後再試。");
  if (
    !/^\d{6,12}$/.test(String(pin)) ||
    hqHash(salt + String(pin)) !== expected.toLowerCase()
  ) {
    cache.put(key, String(Number(cache.get(key) || 0) + 1), 300);
    throw new Error("教師 PIN 不正確。");
  }
}
function hqBook() {
  var id =
    PropertiesService.getScriptProperties().getProperty("HQ_SPREADSHEET_ID");
  if (!id) throw new Error("成績試算表尚未設定。");
  return SpreadsheetApp.openById(id);
}
function hqSheet(name, create) {
  var book = hqBook(),
    sheet = book.getSheetByName(name);
  if (!sheet && create) {
    sheet = book.insertSheet(name);
    sheet.appendRow(
      ["key"].concat(
        Array.from({ length: 24 }, function (_, i) {
          return "record_json_" + (i + 1);
        })
      )
    );
    sheet.setFrozenRows(1);
  }
  return sheet;
}
function hqRecords(name) {
  var sheet = hqSheet(name, false);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet
    .getRange(2, 1, sheet.getLastRow() - 1, 25)
    .getValues()
    .map(function (row, i) {
      var chunks = row.slice(1).filter(function (value) {
        return value !== "";
      });
      // JSON string chunks always begin with a quote, never a spreadsheet formula.
      var json =
        String(chunks[0]).charAt(0) === '"'
          ? chunks
              .map(function (value) {
                return JSON.parse(value);
              })
              .join("")
          : chunks.join("");
      return { key: String(row[0]), data: JSON.parse(json), row: i + 2 };
    });
}
function hqWrite(name, key, data) {
  var sheet = hqSheet(name, true),
    existing = hqRecords(name).find(function (row) {
      return row.key === key;
    });
  var json = JSON.stringify(data);
  if (json.length > 480000)
    throw new Error("內容超過單份提交的儲存上限，請縮短文字。");
  // Keep each Sheets cell below its size limit; clear trailing chunks on edits.
  var chunks = Array.from({ length: 24 }, function (_, i) {
    var part = json.slice(i * 20000, (i + 1) * 20000);
    return part ? JSON.stringify(part) : "";
  });
  sheet
    .getRange(existing ? existing.row : sheet.getLastRow() + 1, 1, 1, 25)
    .setValues([[key].concat(chunks)]);
}
function hqText(value, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error("文字欄位不完整或過長。");
  return value.trim();
}
function hqId(value, max) {
  if (
    typeof value !== "string" ||
    !new RegExp("^[A-Za-z0-9_-]{1," + max + "}$").test(value)
  )
    throw new Error("識別碼格式不正確。");
  return value;
}
function hqQuestions(questions) {
  if (
    !Array.isArray(questions) ||
    questions.length < 1 ||
    questions.length > 30
  )
    throw new Error("每項任務須有 1 至 30 題。");
  var seen = {};
  return questions.map(function (q) {
    var id = hqId(q.id, 40);
    if (seen[id]) throw new Error("題目識別碼重複。");
    seen[id] = true;
    if (q.type !== "choice" && q.type !== "short")
      throw new Error("題型不正確。");
    if (!Number.isInteger(q.points) || q.points < 1 || q.points > 100)
      throw new Error("每題分數須介乎 1 至 100。");
    var result = {
      id: id,
      type: q.type,
      prompt: hqText(q.prompt, 2000),
      points: q.points,
      explanation: hqText(q.explanation, 4000),
    };
    if (q.type === "choice") {
      if (
        !Array.isArray(q.options) ||
        q.options.length < 2 ||
        q.options.length > 6 ||
        !Number.isInteger(q.answer) ||
        q.answer < 0 ||
        q.answer >= q.options.length
      )
        throw new Error("選項或正確答案不正確。");
      result.options = q.options.map(function (option) {
        return hqText(option, 1000);
      });
      result.answer = q.answer;
    }
    return result;
  });
}
function hqVersion(questions) {
  var canonical = questions.map(function (q) {
    return {
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      points: q.points,
      options: q.options || [],
      answer: q.answer == null ? null : q.answer,
      explanation: q.explanation || "",
    };
  });
  var hash = 2166136261;
  for (var c of JSON.stringify(canonical))
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}
function hqCatalogue(tasks) {
  if (!Array.isArray(tasks) || tasks.length > 500)
    throw new Error("任務數目不正確。");
  var seen = {},
    validated = tasks.map(function (t) {
      var id = hqId(t.task_id, 80);
      if (seen[id]) throw new Error("任務識別碼重複。");
      seen[id] = true;
      var questions = hqQuestions(t.questions),
        version = hqVersion(questions);
      if (version !== t.version)
        throw new Error("題目版本不一致，請重新整理網站。");
      return {
        task_id: id,
        title: hqText(t.title, 300),
        questions: questions,
        version: version,
        active: true,
      };
    });
  // Validate everything first; unpublished tasks become inactive without deleting old results.
  hqRecords("HQ_catalogue").forEach(function (record) {
    if (!seen[record.key])
      hqWrite(
        "HQ_catalogue",
        record.key,
        Object.assign({}, record.data, { active: false })
      );
  });
  validated.forEach(function (t) {
    hqWrite("HQ_catalogue", t.task_id, t);
  });
  return { count: validated.length };
}
function hqMark(questions, answers) {
  if (!Array.isArray(answers) || answers.length !== questions.length)
    throw new Error("請回答所有題目。");
  var seen = {};
  answers.forEach(function (a) {
    if (!a || typeof a.question_id !== "string" || seen[a.question_id])
      throw new Error("答案識別碼重複或不完整。");
    seen[a.question_id] = true;
  });
  return questions.map(function (q) {
    var answer = answers.find(function (a) {
      return a.question_id === q.id;
    });
    if (!answer) throw new Error("缺少題目答案。");
    var value = answer.value,
      response,
      awarded;
    if (q.type === "choice") {
      if (!Number.isInteger(value) || value < 0 || value >= q.options.length)
        throw new Error("選項不正確。");
      response = q.options[value];
      awarded = value === q.answer ? q.points : 0;
    } else {
      response = hqText(value, 4000);
      awarded = null;
    }
    return {
      question_id: q.id,
      type: q.type,
      prompt: q.prompt,
      response: response,
      points: q.points,
      awarded: awarded,
      explanation: q.explanation,
      feedback: "",
    };
  });
}
function hqPercentage(answers) {
  if (
    answers.some(function (a) {
      return a.awarded === null;
    })
  )
    return null;
  var max = answers.reduce(function (n, a) {
    return n + a.points;
  }, 0);
  return max
    ? Math.round(
        (100 *
          answers.reduce(function (n, a) {
            return n + a.awarded;
          }, 0)) /
          max
      )
    : 0;
}
function hqSubmit(body) {
  var id = hqId(body.attempt_id, 200);
  var existing = hqRecords("HQ_submissions").find(function (row) {
    return row.key === id;
  });
  if (existing) {
    if (
      existing.data.receipt_hash &&
      hqHash(body.receipt || "") !== existing.data.receipt_hash
    )
      throw new Error("提交識別碼已使用。");
    return { attempt_id: id }; // A retry cannot overwrite marks or feedback.
  }
  var record = {
    attempt_id: id,
    task_id: hqId(body.task_id, 80),
    class_name: hqId(body.class_name, 20).toUpperCase(),
    student_no: hqId(body.student_no, 20).toUpperCase(),
    student_name: hqText(body.student_name, 80),
    timestamp: new Date().toISOString(),
    progress: 100,
    revision: 1,
    feedback: "",
  };
  if (body.action === "legacy_submit") {
    if (!Number.isFinite(body.score) || body.score < 0 || body.score > 100)
      throw new Error("舊成績格式不正確。");
    record.status = "legacy";
    record.score = body.score;
    record.progress = body.progress == null ? 100 : Number(body.progress);
    if (
      !Number.isFinite(record.progress) ||
      record.progress < 0 ||
      record.progress > 100
    )
      throw new Error("進度格式不正確。");
    record.answers = [];
  } else {
    if (
      typeof body.receipt !== "string" ||
      !/^[a-f0-9-]{72}$/.test(body.receipt)
    )
      throw new Error("提交查閱碼不正確。");
    var catalogue = hqRecords("HQ_catalogue").find(function (row) {
      return row.key === record.task_id;
    });
    if (!catalogue || !catalogue.data.active)
      throw new Error("老師尚未同步此任務題目，答案已保留，請稍後重試。");
    if (catalogue.data.version !== body.assessment_version)
      throw new Error(
        "題目已更新，這份答案暫時不能入帳；請聯絡老師並保留本機資料。"
      );
    record.task_title = catalogue.data.title;
    record.assessment_version = catalogue.data.version;
    record.answers = hqMark(catalogue.data.questions, body.answers);
    record.score = hqPercentage(record.answers);
    record.status = record.score === null ? "pending" : "graded";
    record.receipt_hash = hqHash(body.receipt);
  }
  hqWrite("HQ_submissions", id, record);
  return { attempt_id: id };
}
function hqPublicRecord(record) {
  var copy = Object.assign({}, record);
  delete copy.receipt_hash;
  return copy;
}
function hqResult(body) {
  var row = hqRecords("HQ_submissions").find(function (r) {
    return r.key === body.attempt_id;
  });
  if (
    !row ||
    !row.data.receipt_hash ||
    hqHash(body.receipt || "") !== row.data.receipt_hash
  )
    throw new Error("未找到此提交。請檢查查閱碼，或稍後重試尚未同步的答案。");
  var result = hqPublicRecord(row.data);
  delete result.student_name;
  delete result.student_no;
  delete result.class_name;
  return { row: result };
}
function hqGrade(body) {
  var row = hqRecords("HQ_submissions").find(function (r) {
    return r.key === body.attempt_id;
  });
  if (!row || row.data.status === "legacy")
    throw new Error("未找到可批改的提交。");
  if (row.data.revision !== body.revision)
    throw new Error("這份提交已被更新，請重新整理再批改。");
  if (!Array.isArray(body.marks)) throw new Error("缺少批改分數。");
  var shorts = row.data.answers.filter(function (a) {
    return a.type === "short";
  });
  if (
    body.marks.length !== shorts.length ||
    new Set(
      body.marks.map(function (m) {
        return m.question_id;
      })
    ).size !== shorts.length
  )
    throw new Error("批改題目不完整或重複。");
  row.data.answers.forEach(function (answer) {
    if (answer.type !== "short") return;
    var mark = body.marks.find(function (m) {
      return m.question_id === answer.question_id;
    });
    if (
      !mark ||
      !Number.isFinite(mark.awarded) ||
      mark.awarded < 0 ||
      mark.awarded > answer.points
    )
      throw new Error("批改分數超出範圍。");
    answer.awarded = mark.awarded;
    answer.feedback = String(mark.feedback || "").slice(0, 2000);
  });
  row.data.feedback = String(body.feedback || "").slice(0, 2000);
  row.data.score = hqPercentage(row.data.answers);
  row.data.status = "graded";
  row.data.revision++;
  row.data.reviewed_at = new Date().toISOString();
  hqWrite("HQ_submissions", row.key, row.data);
  return { row: hqPublicRecord(row.data) };
}
function hqRoster(body) {
  var properties = PropertiesService.getScriptProperties(),
    revision = Number(properties.getProperty("HQ_ROSTER_REVISION") || 0);
  if (body.revision !== revision)
    throw new Error("班級名單已更新，請重新整理後再匯入。");
  if (
    !Array.isArray(body.students) ||
    !body.students.length ||
    body.students.length > 2000
  )
    throw new Error("每次匯入 1 至 2000 位學生。");
  var seen = {},
    students = body.students.map(function (s) {
      var result = {
        class_name: hqId(s.class_name, 20).toUpperCase(),
        student_no: hqId(s.student_no, 20).toUpperCase(),
        student_name: hqText(s.student_name, 80),
      };
      var key = result.class_name + ":" + result.student_no;
      if (seen[key]) throw new Error("班別與學號重複。");
      seen[key] = true;
      return result;
    });
  var merged = new Map(
    hqRecords("HQ_roster").map(function (r) {
      return [r.key, r.data];
    })
  );
  students.forEach(function (s) {
    merged.set(s.class_name + ":" + s.student_no, s);
  });
  var values = Array.from(merged, function (pair) {
    return [pair[0], JSON.stringify(pair[1])];
  });
  hqSheet("HQ_roster", true).getRange(2, 1, values.length, 2).setValues(values);
  properties.setProperty("HQ_ROSTER_REVISION", String(revision + 1));
  return {
    roster: hqRecords("HQ_roster").map(function (r) {
      return r.data;
    }),
    roster_revision: revision + 1,
  };
}
function hqAdmin() {
  var rows = hqRecords("HQ_submissions").map(function (r) {
    return hqPublicRecord(r.data);
  });
  var ids = new Set(
    rows.map(function (r) {
      return r.attempt_id;
    })
  );
  // Bring forward compatible legacy task tabs without modifying their cells.
  hqBook()
    .getSheets()
    .filter(function (s) {
      return s.getName().indexOf("HQ_") !== 0 && s.getLastRow() > 1;
    })
    .forEach(function (sheet) {
      var values = sheet.getDataRange().getValues(),
        headers = values.shift().map(String);
      if (
        !["attempt_id", "task_id", "student_no", "class_name", "score"].every(
          function (h) {
            return headers.indexOf(h) !== -1;
          }
        )
      )
        return;
      values.forEach(function (cells) {
        var row = {};
        headers.forEach(function (h, i) {
          row[h] = cells[i] instanceof Date ? cells[i].toISOString() : cells[i];
        });
        if (!row.attempt_id || ids.has(String(row.attempt_id))) return;
        ids.add(String(row.attempt_id));
        rows.push({
          attempt_id: String(row.attempt_id),
          task_id: String(row.task_id),
          class_name: String(row.class_name),
          student_no: String(row.student_no),
          student_name: String(row.student_name || ""),
          timestamp: row.timestamp || "",
          score: row.score,
          progress: row.progress,
          status: "legacy",
          answers: [],
        });
      });
    });
  return {
    rows: rows,
    roster: hqRecords("HQ_roster").map(function (r) {
      return r.data;
    }),
    roster_revision: Number(
      PropertiesService.getScriptProperties().getProperty(
        "HQ_ROSTER_REVISION"
      ) || 0
    ),
  };
}
