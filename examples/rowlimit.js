/* Copyright (c) 2015, 2022, Oracle and/or its affiliates. */

/******************************************************************************
 *
 * This software is dual-licensed to you under the Universal Permissive License
 * (UPL) 1.0 as shown at https://oss.oracle.com/licenses/upl and Apache License
 * 2.0 as shown at http://www.apache.org/licenses/LICENSE-2.0. You may choose
 * either license.
 *
 * If you elect to accept the software under the Apache License, Version 2.0,
 * the following applies:
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * NAME
 *   rowlimit.js
 *
 * DESCRIPTION
 *   Shows ways to limit the number of records fetched by queries.
 *
 *   Although maxRows can be used to control the number of rows available to the
 *   application, it is more efficient for the database if the SQL query syntax
 *   limits the number of rows returned from the database.  Use maxRows to
 *   prevent badly coded queries from over-consuming Node.js resources, or when
 *   the number of rows to be selected is a known, small value.
 *
 *   This example uses Node 8's async/await syntax.
 *
 *****************************************************************************/

const fs = require('fs');
const oracledb = require('oracledb');
const dbConfig = require('./dbconfig.js');
const demoSetup = require('./demosetup.js');

// On Windows and macOS, you can specify the directory containing the Oracle
// Client Libraries at runtime, or before Node.js starts.  On other platforms
// the system library search path must always be set before Node.js is started.
// See the node-oracledb installation documentation.
// If the search path is not correct, you will get a DPI-1047 error.
let libPath;
if (process.platform === 'win32') {           // Windows
  libPath = 'C:\\oracle\\instantclient_19_12';
} else if (process.platform === 'darwin') {   // macOS
  libPath = process.env.HOME + '/Downloads/instantclient_19_8';
}
if (libPath && fs.existsSync(libPath)) {
  oracledb.initOracleClient({ libDir: libPath });
}

const myoffset     = 1;  // number of rows to skip
const mymaxnumrows = 2;  // number of rows to fetch

async function run() {

  let connection;

  try {
    connection = await oracledb.getConnection(dbConfig);

    await demoSetup.setupBf(connection);  // create the demo table

    let sql = `SELECT id, farmer FROM no_banana_farmer ORDER BY id`;

    if (connection.oracleServerVersion >= 1201000000) {
      // 12c row-limiting syntax
      sql += ` OFFSET :offset ROWS FETCH NEXT :maxnumrows ROWS ONLY`;
    } else {
      // Pre-12c syntax [you could also customize the original query and use row_number()]
      sql = `SELECT * FROM (SELECT A.*, ROWNUM AS MY_RNUM FROM ( ${sql} ) A
             WHERE ROWNUM <= :maxnumrows + :offset) WHERE MY_RNUM > :offset`;
    }

    const result = await connection.execute(
      sql,
      { offset: myoffset, maxnumrows: mymaxnumrows },
      { prefetchRows: mymaxnumrows + 1, fetchArraySize: mymaxnumrows }
    );

    console.log("Executed: " + sql);
    console.log("Number of rows returned: " + result.rows.length);
    console.log(result.rows);

  } catch (err) {
    console.error(err);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error(err);
      }
    }
  }
}

run();
