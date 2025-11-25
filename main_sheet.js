function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const data = JSON.parse(e.postData.contents);

    const domain = data.domain;
    const csvLink = data.csvLink;

    // Fetch CSV content
    const response = UrlFetchApp.fetch(csvLink);
    const csvContent = response.getContentText();

    // Convert CSV to 2D array
    const csvData = Utilities.parseCsv(csvContent);

    // Import CSV into RowData-DOMAINNAME tab
    const rowDataSheetName = `RowData-${domain}`;
    let rowSheet = ss.getSheetByName(rowDataSheetName);
    let startRow;

    if (!rowSheet) {
      // Sheet doesn't exist -> create it and include headers
      rowSheet = ss.insertSheet(rowDataSheetName);
      startRow = 1;
    } else {
      csvData.shift(); // remove headers
      startRow = rowSheet.getLastRow() + 1;
    }

    if (csvData.length > 0) {
      rowSheet
        .getRange(startRow, 1, csvData.length, csvData[0].length)
        .setValues(csvData);
    }

    // Return confirmation
    return ContentService.createTextOutput(
      JSON.stringify({ status: "success", message: "CSV imported successfully" })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: "error", message: err.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
