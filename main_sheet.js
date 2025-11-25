//Globals
const SUPPORTED_PARAMS_SHEET_NAME = "supported-parameters-config";
function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const data = JSON.parse(e.postData.contents);
    main(data);
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

//Main function
function main(data){
    //Initialize Data
    const domain = data.domain;
    const csvLink = data.csvLink;
    const csvContent = getCsvContent(csvLink);
    let csvData = convertCsvToArray(csvContent);

    //Add headers
    csvData = addDevRequestColumn(csvData);
    const headersList = getSheetHeaders();
    csvData = addHeadersToCSV(csvData, headersList);


    //Prapare sheet
    const tabData = getOrCreateTab(domain);
    const rowSheet = tabData.rowSheet;
    overwriteHeadersFromIndex(rowSheet,headersList);
    let startRow = tabData.startRow;
    if (startRow != 1){ // remove headers
      csvData.shift(); 
      startRow = rowSheet.getLastRow() + 1;
    }

    //Write results
    writeCsvToSheet(csvData,rowSheet,startRow);

}

/*
Receives:
  - RowData_domainName (sheet object)
Does:
  - Ovverites the headers with the current headers that are in SUPPORTED_PARAMS_SHEET_NAME
Returns:
  - N/A
*/
function overwriteHeadersFromIndex(sheet, headersList) {
    const startColumn = 32;
    sheet.getRange(1, startColumn, 1, headersList.length).setValues([headersList]);
    return;
}

/*
Receives:
  - csv link from the send-logs worker
Does:
  - Get the content of the csv from the link
Returns:
  - content of the scv
*/
function getCsvContent(csvLink){
    const response = UrlFetchApp.fetch(csvLink);
    const csvContent = response.getContentText();
    return csvContent;
}

/*
Receives:
  - csv content
Does:
  - convert the content to a 2D array for the sheet
Returns:
  - 2D array of the csv
*/
function convertCsvToArray(csvContent){
    const csvData = Utilities.parseCsv(csvContent);
    return csvData;
}

/*
Receives:
  - csv data (2d array)
  - RowData-DomainName sheet (sheet object)
  - starting row to write from
Does:
  - Writes the data to the sheet
Returns:
  - Nothing
*/
function writeCsvToSheet(csvData, sheet, startRow){
  if (csvData.length > 0) {
      sheet
        .getRange(startRow, 1, csvData.length, csvData[0].length)
        .setValues(csvData);
    }
  return;
}


/*
Receives:
  - domain (string: name of domain)
Does:
  - Get or create a "RowData-domainName" tab
  - Get the first open row to write from
Returns:
  - startRow
  - rowSheet
*/
function getOrCreateTab(domain){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rowDataSheetName = `${domain}`;
  let rowSheet = ss.getSheetByName(rowDataSheetName);
  let startRow;

  if (!rowSheet) {
    rowSheet = ss.insertSheet(rowDataSheetName);
    startRow = 1;
  }else{
    startRow = rowSheet.getLastRow() + 1;
  }
  return {
    startRow: startRow,
    rowSheet: rowSheet
  }
}

/*
Receives:
  - csvData (2D Array)
Does:
  - Adds a "Dev Request" column to the end
  - Populate every row in that column with a function
    - Function makes a copy of column C(URL)
Returns:
  - Updated Csv Data
*/
function addDevRequestColumn(csvData) {
    // Add "Dev Request" header to the first row
    csvData[0].push("Dev Request");
    
    // Add the formula to each data row
    for (let i = 1; i < csvData.length; i++) {
        csvData[i].push(`=LOWER(INDIRECT("C" & ROW()))`);
    }
    return csvData;
}


/*
Receives:
  - N/A
Does:
  - get the headers from the sheet
Returns:
  - supported headers list
*/
function getSheetHeaders() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SUPPORTED_PARAMS_SHEET_NAME);
    
    if (!sheet) {
        throw new Error(`Sheet "${SUPPORTED_PARAMS_SHEET_NAME}" not found`);
    }
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    return headers;
}

/*
Receives:
  - csvData (2D Array)
  - headers List
Does:
  - Adds all the headers in the list to the csv
  - Populate every row in every new column with a function
    - Function splits the url to the correct parameter
Returns:
  - Updated Csv Data
*/
function addHeadersToCSV(csvData, headersList) {
    csvData[0].push(...headersList);
    const startColIndex = csvData[0].length - headersList.length;
    
    for (let i = 1; i < csvData.length; i++) {
        for (let j = 0; j < headersList.length; j++) {
            const colIndex = startColIndex + j + 1; // +1 for 1-based indexing
            const formula = `=IFERROR(REGEXEXTRACT(AE${i + 1},INDIRECT(ADDRESS(1, ${colIndex})) & "=([^&]+)"),"")`;
            csvData[i].push(formula);
        }
    }
    
    return csvData;
}


/*function qa(){
  const payload = {
      "domain":"test.com",
      "csvLink":"https://pub-553b971531a74dbe9068679b63c088bc.r2.dev/251125_0712_void.bid.csv"
  }
  main(payload);
  return;
}*/










