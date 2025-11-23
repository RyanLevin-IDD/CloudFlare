//Globals
const CLIENT_SHEET_WEBAPP = "https://script.google.com/macros/s/AKfycbwGfWZSfpuCUh-6oyMkLDexlE0RJhuNSYKxhi4lnk9FsRaLVC-Ks5D15cR_bHFTkktOxg/exec";


//Endpoints
function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "No JSON body received"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const data = JSON.parse(e.postData.contents);
    handleAccessLogs(data);
    if (data.results && Array.isArray(data.results)) {
      Logger.log("Received logs: " + JSON.stringify(data));
      const data = JSON.parse(e.postData.contents);

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        received: data.results.length
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "Missing field: results"
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
function sendToApi(payload) {
  try {
    const url = CLIENT_SHEET_WEBAPP; 
    
    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() === 200) {
      return { success: true };
    } else {
      return { success: false, error: result.error || "API error" };
    }
    
  } catch (err) {
    return { success: false, error: err.message };
  }
}
//Handle raw data
function handleAccessLogs(data) { //Writes raw data to sheet and triggers log sheet handling
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  const domain = data.domain;
  let results = data.results;

  // Main sheet for access logs
  const mainSheetName = `RawData-${domain}`;
  let mainSheet = sheet.getSheetByName(mainSheetName);
  const isFirstRun = !mainSheet;

  if (!mainSheet) {
    mainSheet = sheet.insertSheet(mainSheetName);
  }
  const baseHeaders = [
  "timestamp",
  "method",
  "url",
  "path",
  "query",
  "ip",
  "country",
  "colo",
  "asn",
  "tlsVersion",
  "protocol",
  "userAgent",
  "rayId",
  "contentType",
  "headers",
  "body",
  "accept",
  "accept-encoding",
  "accept-language",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "connection",
  "host",
  "user-agent",
  "x-forwarded-proto",
  "x-real-ip",
  "content-length",
  "cookie"
  ];
  ensureColumnsExists(mainSheet, baseHeaders);

  results = formatResultsDateTime(results);
  appendRows(mainSheet, results, baseHeaders);
  handleLogsSheet(results,baseHeaders,domain);
  return;
}
function handleLogsSheet(results, baseHeaders, domain) { //Writes raw data to log sheet and split the headers
  // Create or fetch logs sheet
  const logsSheet = createLogsSheet(domain, baseHeaders);
  
  // Append results and get the row range
  const range = appendResultsToSheet(logsSheet, results);
  
  // Fill Dev Request column for the newly added rows
  fillDevRequestColumn(logsSheet, range.startRow, range.endRow, results);
  //Split headers
  parseRequestParameters(logsSheet, range.startRow, range.endRow);
  //Send to main sheet
  copyAndSendData(range.startRow,domain);
}
function appendResultsToSheet(sheet, results) { //write results to sheet at the buttom
  if (!results || results.length === 0) return;
  
  const startRow = sheet.getLastRow() + 1;
  
  results.forEach(r => sheet.appendRow(Object.values(r)));
  
  const endRow = sheet.getLastRow();
  
  return { startRow: startRow, endRow: endRow };
}
//Splitting headers
function fillDevRequestColumn(sheet, startRow, endRow, results) {
  const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const devRequestColIndex = headerRow.indexOf("Dev Request") + 1;
  
  if (devRequestColIndex === 0) return;
  
  const urls = results.map(result => [result.url || ""]);
  
  sheet.getRange(startRow, devRequestColIndex, urls.length, 1).setValues(urls);
}
function createLogsSheet(domain, headersList) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = `${domain}`;
  
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const allHeaders = [...headersList, "Dev Request"];
    sheet.appendRow(allHeaders);
    // Color headers
    sheet.getRange(1, 1, 1, headersList.length).setBackground("#93CCEA");
    sheet.getRange(1, headersList.length + 1, 1, 1).setBackground("#fff2cc");
    sheet.getRange(1, headersList.length + 1, sheet.getMaxRows(), 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  }
  return sheet;
}
function parseRequestParameters(sheet, startRow, endRow) {
  const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const requestColIndex = headerRow.indexOf("Dev Request");
  
  if (requestColIndex === -1) return;
  
  const data = sheet.getRange(startRow, 1, endRow - startRow + 1, sheet.getLastColumn()).getValues();
  const headers = [...headerRow];
  const existingParamCols = {};
  
  // Map existing parameter columns
  for (let i = requestColIndex + 1; i < headers.length; i++) {
    if (typeof headers[i] === "string") {
      existingParamCols[headers[i].toLowerCase()] = i;
    }
  }
  
  // Process each row
  data.forEach((row, rowIdx) => {
    const url = row[requestColIndex] || "";
    const params = parseUrl(url);
    
    params.forEach(([key, value]) => {
      const keyLower = key.toLowerCase();
      let colIndex;

      // If key is empty -> treat as "NULL"
      const normalizedKey = keyLower === "" ? "null" : keyLower;

      colIndex = existingParamCols[normalizedKey];

      // Create column only when needed
      if (colIndex === undefined) {
        const newHeaderName = normalizedKey === "null" ? "NULL" : key;
        headers.push(newHeaderName);
        colIndex = headers.length - 1;
        existingParamCols[normalizedKey] = colIndex;

        sheet.getRange(1, colIndex + 1).setValue(newHeaderName);
        sheet.getRange(1, colIndex + 1).setBackground("#b6d7a8");
      }

      // Set value in row
      sheet.getRange(startRow + rowIdx, colIndex + 1).setValue(value);
    });
  });
}
function parseUrl(url) {
  const params = [];
  
  if (!url) return params;
  
  const [, queryString] = url.split("?");
  
  if (!queryString) return params;
  
  const pairs = queryString.split("&");
  
  pairs.forEach(pair => {
    if (pair.includes("=")) {
      let [key, value] = pair.split("=");
      key = decodeURIComponent(key);
      value = decodeURIComponent(value || "");
      
      // Handle empty value
      if (value === "") {
        value = "NULL";
      }
      
      // Handle empty key
      if (key === "") {
        key = "NULL";
      }
      
      params.push([key, value]);
    }
  });
  
  return params;
}
//Helpers
function appendRows(sheet, data, baseHeaders) {
  if (!data || data.length === 0) return;

  // First Run
  if (typeof data[0] === 'object' && !Array.isArray(data[0])) {
    const rows = data.map(obj => baseHeaders.map(h => obj[h] || ""));
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
  //Not First Run
  else if (Array.isArray(data[0])) {
    sheet.getRange(sheet.getLastRow() + 1, 1, data.length, data[0].length).setValues(data);
  }
}

function ensureColumnsExists(sheet, requiredColumns) {
  let lastCol = sheet.getLastColumn();
  const headerRow = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];

  requiredColumns.forEach(col => {
    if (!headerRow.includes(col)) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(col);
    }
  });
  sheet.getRange(1, 1, 1, requiredColumns.length).setBackground("#93CCEA");
}

function formatResultsDateTime(results) { //Splits request to headers
  return results.map(r => {
    if (r["Time"]) {
      const d = new Date(r["Time"]);
      if (!isNaN(d.getTime())) {
        const month = d.getMonth() + 1;
        const day = d.getDate();
        const year = d.getFullYear();
        let hours = d.getHours();
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        
        r["Time"] = `${month}/${day}/${year} ${hours}:${minutes}:${seconds} ${ampm}`;
      }
    }
    return r;
  });
}

//Send results to main sheet
function copyAndSendData(firstRowIndex, domainSheetName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const domainSheet = ss.getSheetByName(domainSheetName);
    
    if (!domainSheet) {
      return { success: false, error: "Sheet not found" };
    }
    
    const lastRow = domainSheet.getLastRow();
    const numRows = lastRow - firstRowIndex + 1;
    const numCols = domainSheet.getLastColumn();
    
    const copiedData = domainSheet.getRange(firstRowIndex, 1, numRows, numCols).getValues();
    
    // Send to main sheet function
    sendDataToMainSheet(domainSheetName, copiedData);
    
    return { success: true };
    
  } catch (err) {
    return { success: false, error: err.message };
  }
}
function sendDataToMainSheet(domainName, copiedData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const domainSheet = ss.getSheetByName(domainName);
    
    if (!domainSheet) {
      return { success: false, error: "Sheet not found" };
    }
    
    // Get headers from first row
    const headers = domainSheet.getRange(1, 1, 1, domainSheet.getLastColumn()).getValues()[0];
    
    // Create payload
    const payload = {
      tabname: domainName,
      results: copiedData,
      headers: headers
    };
    
    // Send to main sheet API
    const response = sendToApi(payload);
    
    if (response.success) {
      return { success: true };
    } else {
      return { success: false, error: response.error };
    }
    
  } catch (err) {
    return { success: false, error: err.message };
  }
}