/* Copyright (c) 2015, 2022, Oracle and/or its affiliates. */

/******************************************************************************
 *
 * This software is dual-licensed to you under the Universal Permissive License
 * (UPL) 1.0 as shown at https://oss.oracle.com/licenses/upl and Apache License
 * 2.0 as shown at https://www.apache.org/licenses/LICENSE-2.0. You may choose
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
 *   63. autoCommit4nestedExecutes.js
 *
 * DESCRIPTION
 *   Nested executes where the 2nd execute fails used to cause an unexpected
 *   commit, even though the autoCommit:false setting is enabled at the
 *   execute() and/or oracledb level. This is github issue 269. It has
 *   been fixed in 1.4.
 *
 *   https://github.com/oracle/node-oracledb/issues/269
 *
 *****************************************************************************/
'use strict';

const oracledb = require('oracledb');
const assert   = require('assert');
const dbConfig = require('./dbconfig.js');

describe('63. autoCommit4nestedExecutes.js', function() {

  const tableName  = "nodb_issue269tab";
  const procName   = "issue269proc";
  let connection;

  before('prepare table and procedure', async function() {

    const sqlCreateTab =
        " BEGIN "
      + "   DECLARE "
      + "     e_table_missing EXCEPTION; "
      + "     PRAGMA EXCEPTION_INIT(e_table_missing, -00942); "
      + "   BEGIN "
      + "     EXECUTE IMMEDIATE ('DROP TABLE " + tableName + " PURGE'); "
      + "   EXCEPTION "
      + "     WHEN e_table_missing "
      + "     THEN NULL; "
      + "   END;  "
      + "   EXECUTE IMMEDIATE (' "
      + "     CREATE TABLE " + tableName + " ( "
      + "       myts timestamp, p_iname VARCHAR2(40), "
      + "       p_short_name VARCHAR2(40), p_comments VARCHAR2(40) "
      + "     ) "
      + "   '); "
      + " END; ";

    const sqlCreateProc =
        " CREATE OR REPLACE PROCEDURE " + procName + "(p_iname IN VARCHAR2, "
      + "   p_short_name IN VARCHAR2, p_comments IN VARCHAR2, p_new_id OUT NUMBER, p_status OUT NUMBER, "
      + "   p_description OUT VARCHAR2) "
      + " AS "
      + " BEGIN "
      + "   p_description := p_iname || ' ' || p_short_name || ' ' || p_comments; "
      + "   p_new_id := 1; "
      + "   p_status := 2; "
      + "   insert into " + tableName + " values (systimestamp, p_iname, p_short_name, p_comments); "
      + " END; ";

    connection = await oracledb.getConnection(dbConfig);
    await connection.execute(sqlCreateTab);

    await connection.execute(sqlCreateProc);
  }); // before

  after('drop table and procedure', async function() {
    await connection.execute("DROP PROCEDURE " + procName);
    await connection.execute("DROP TABLE " + tableName + " PURGE");
    await connection.close();
  }); // after

  it('63.1 nested execute() functions', async function() {

    // sql will be the same for both execute calls
    const procSql = "BEGIN " + procName + "(p_iname=>:p_iname, p_short_name=>:p_short_name, "
                  + " p_comments=>:p_comments, p_new_id=>:p_new_id, p_status=>:p_status, "
                  + " p_description=>:p_description); END;";

    const pool = await oracledb.createPool(dbConfig);
    const conn = await pool.getConnection();

    await conn.execute(
      procSql,
      {
        p_iname: "Test iname",
        p_short_name: "TST",
        p_comments: "Test comments",
        p_new_id: {
          type: oracledb.NUMBER,
          dir: oracledb.BIND_OUT
        },
        p_status: {
          type: oracledb.NUMBER,
          dir: oracledb.BIND_OUT
        },
        p_description: {
          type: oracledb.STRING,
          dir: oracledb.BIND_OUT
        }
      },
      { autoCommit: false });

    const binds = {
      p_iname123: "Test iname", // specify wrong bind parameter name to cause an error
      p_short_name: "TST",
      p_comments: "Test comments",
      p_new_id: {
        type: oracledb.NUMBER,
        dir: oracledb.BIND_OUT
      },
      p_status: {
        type: oracledb.NUMBER,
        dir: oracledb.BIND_OUT
      },
      p_description: {
        type: oracledb.STRING,
        dir: oracledb.BIND_OUT
      }
    };
    const options = {
      autoCommit: false
    };
    await assert.rejects(
      async () => await conn.execute(procSql, binds, options),
      /ORA-01036:/
    );

    await conn.release();
    await pool.terminate();

    const result = await connection.execute(
      "SELECT count(*) as amount FROM " + tableName,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT });
    assert.strictEqual(result.rows[0].AMOUNT, 0);

  });

});
