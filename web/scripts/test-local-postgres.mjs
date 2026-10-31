// Own disposable database only. Live data is never used by the HTTP smoke test.
import {randomUUID} from "node:crypto";
import {credentials,clientFor,urlFor,run,start,webRoot,tables} from "./windows-postgres.mjs";
const c=await credentials();await start();
const database=`anafix_http_${randomUUID().replaceAll("-","")}_test`;
const admin=clientFor(c,"admin","postgres");await admin.connect();
let created=false;
try {
  await admin.query(`CREATE DATABASE ${database} TEMPLATE template0`);created=true;
  await admin.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
  await admin.query(`GRANT CONNECT ON DATABASE ${database} TO anafix_app`);
  await run(process.execPath,["--experimental-strip-types","scripts/database.mjs","migrate"],{cwd:webRoot,env:{...process.env,DATABASE_URL:urlFor(c,"admin",database),DATABASE_SSL_MODE:"disable"}});
  const db=clientFor(c,"admin",database);await db.connect();
  try {
    await db.query("GRANT USAGE ON SCHEMA anafix TO anafix_app");
    for(const table of tables.filter(t=>t!=="schema_migration"))await db.query(`GRANT ${["examination_revision","index_state"].includes(table)?"SELECT":table==="audit_event"?"SELECT,INSERT":table==="examination"?"SELECT,INSERT,UPDATE":"SELECT,INSERT,UPDATE,DELETE"} ON anafix.${table} TO anafix_app`);
    await db.query("GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA anafix TO anafix_app");
  }finally{await db.end();}
  const result=await run(process.execPath,["scripts/smoke-export.mjs","--postgres"],{cwd:webRoot,env:{...process.env,DATABASE_TEST_URL:urlFor(c,"admin",database),DATABASE_TEST_APP_URL:urlFor(c,"app",database)}});
  console.log(result.trim());
  console.log("Two independent website processes passed PostgreSQL HTTP integration using the restricted application role.");
}catch(error){console.error(error.diagnostic || error.message);process.exitCode=1;}
finally{
  if(created)await admin.query(`DROP DATABASE ${database}`).catch(()=>console.error("Own test database cleanup requires checking."));
  await admin.end();
}
