import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { skipsPublicDemoCooldown } from "./public-demo-policy.ts";

const webDirectory=path.resolve("synthetic-web");
const run=path.join(webDirectory,".data","public-demo","run-synthetic");
const demo:Record<string,string|undefined>={ANAFIX_DEMO_MODE:"true",ANAFIX_DEMO_NO_COOLDOWN:"true",STORAGE_BACKEND:"files",DATABASE_URL:"",ANAFIX_LOCAL_ENV_PATH:"",OFFLINE_ENABLED:"false",IDENTITY_STORE_PATH:path.join(run,"identities.enc"),EXAMINATION_STORE_PATH:path.join(run,"examinations.enc"),MFA_STORE_PATH:path.join(run,"mfa.enc")};

test("only the isolated public demo can omit login and MFA waiting periods",()=>{
  for(const scope of ["login-account","login-network","mfa"])assert.equal(skipsPublicDemoCooldown(scope,demo,webDirectory),true);
  assert.equal(skipsPublicDemoCooldown("export",demo,webDirectory),false);
  assert.equal(skipsPublicDemoCooldown("login-account",{},webDirectory),false);
});

test("production, PostgreSQL and working file stores retain rate limits even with a demo flag",()=>{
  const rejected:Record<string,string|undefined>[]=[
    {...demo,ANAFIX_DEMO_MODE:"false"},{...demo,ANAFIX_DEMO_NO_COOLDOWN:"false"},
    {...demo,STORAGE_BACKEND:"postgres"},{...demo,DATABASE_URL:"postgresql://synthetic.invalid/demo"},
    {...demo,ANAFIX_LOCAL_ENV_PATH:"private-env-file"},{...demo,OFFLINE_ENABLED:"true"},
    {...demo,IDENTITY_STORE_PATH:path.join(webDirectory,".data","identities.enc")},
    {...demo,EXAMINATION_STORE_PATH:path.join(webDirectory,".data","working-examinations.enc")},
    {...demo,MFA_STORE_PATH:path.join(webDirectory,".data","working-mfa.enc")},
    {...demo,IDENTITY_STORE_PATH:"relative-identities.enc"},
    {...demo,IDENTITY_STORE_PATH:path.join(run,"unexpected-name.enc")},
  ];
  for(const env of rejected)assert.equal(skipsPublicDemoCooldown("login-account",env,webDirectory),false);
});
