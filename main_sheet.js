function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "No JSON body received"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const payload = JSON.parse(e.postData.contents);
    
    writeDataToSheet(payload);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success"
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function writeDataToSheet(data) {
  try {
    const domainName = data.tabname;
    const headers = data.headers;
    const results = data.results;
    
    const sheet = getOrCreateTab(domainName, headers);
    
    // Append results to sheet
    if (results && results.length > 0) {
      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, results.length, results[0].length).setValues(results);
    }
    
    return { success: true };
    
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getOrCreateTab(domainName, headers) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(domainName);
    
    if (sheet) {
      // Override first row with headers
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    } else {
      // Create new sheet with headers
      sheet = ss.insertSheet(domainName);
      sheet.appendRow(headers);
    }

    //COLORING
    const headerRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const devIndex = headerRow.indexOf("Dev Request") + 1;
    if (devIndex === 0) return sheet; // Not found
    // Colors
    const blue = "#cfe2ff";    // light blue
    const yellow = "#fff3cd";  // light yellow
    const green = "#d1e7dd";   // light green
    sheet.getRange(1, devIndex).setBackground(yellow);
    if (devIndex > 1) {
      sheet.getRange(1, 1, 1, devIndex - 1).setBackground(blue);
    }
    if (devIndex < headers.length) {
      sheet.getRange(1, devIndex + 1, 1, headers.length - devIndex).setBackground(green);
    }

    return sheet;

  } catch (err) {
    throw err;
  }
}