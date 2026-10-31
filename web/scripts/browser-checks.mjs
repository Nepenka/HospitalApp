import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
export async function browserChecks({port,cookie,examinationId}){
 if(!process.env.ANAFIX_TEST_PLAYWRIGHT)throw new Error("SET_ANAFIX_TEST_PLAYWRIGHT_TO_INSTALLED_PACKAGE");
 const {chromium,firefox}=await import(pathToFileURL(process.env.ANAFIX_TEST_PLAYWRIGHT).href),origin=`http://127.0.0.1:${port}`,output=path.resolve(".test-artifacts","browser");await mkdir(output,{recursive:true});
 const report=[];
 for(const [engine,type,options] of [["Firefox",firefox,{}],["Chrome",chromium,{channel:"chrome"}]]){
  const browser=await type.launch({headless:true,...options});
  try{
   for(const width of [1440,390]){
    const context=await browser.newContext({viewport:{width,height:1000},locale:"ru-RU",timezoneId:"Europe/Minsk"});
    const session=cookie("test-organization").split("=").slice(1).join("=");
    await context.addCookies([{name:"__Host-anafix-session",value:session,url:`https://127.0.0.1:${port}/`,secure:true,httpOnly:true,sameSite:"Strict"}]);
    const page=await context.newPage(),errors=[];page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});page.on("pageerror",e=>errors.push(e.message));
    try{
     await page.goto(origin);await page.getByRole("heading",{name:"Данные пациента",exact:true}).waitFor();
     await page.getByLabel(/ФИО пациента/).fill("Синтетический браузерный пациент");
     const time=page.getByLabel(/^Время начала реакции/);await time.fill("0930");await time.press("Tab");assert.equal(await time.inputValue(),"09:30");
     await page.getByRole("button",{name:"Дата начала реакции",exact:true}).click();
     const dialog=page.getByRole("dialog",{name:"Дата начала реакции",exact:true});await dialog.waitFor();
     const singleBox=await dialog.boundingBox();assert.ok(singleBox.x>=0&&singleBox.x+singleBox.width<=width+1,"Reaction calendar stays within viewport");
     await dialog.locator('button[aria-pressed]').first().click();await dialog.getByRole("button",{name:"Готово",exact:true}).click();
     await page.getByRole("button",{name:/^Продолжить/}).click();await page.getByRole("heading",{name:"Клинические симптомы",exact:true}).waitFor();
     const variant=page.getByRole("combobox",{name:/Вариант симптома/}).first();
     await variant.selectOption({index:1});assert.notEqual(await variant.inputValue(),"");
     await page.getByRole("button",{name:/^Продолжить/}).click();await page.getByRole("heading",{name:"Витальные показатели",exact:true}).waitFor();
     const age=page.getByLabel("Полных лет",{exact:true});await age.fill("");assert.equal(await age.inputValue(),"");await age.fill("19");assert.equal(await age.inputValue(),"19");
     await page.getByRole("button",{name:/^Рассчитать результат/}).click();await page.getByRole("heading",{name:/^ОАР \d степени$/}).waitFor();
     await page.getByRole("textbox",{name:/^Комментарий\/уточнение врача/}).fill("Синтетический комментарий браузерной проверки");
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,"Wizard result fits the viewport");
     await page.reload();await page.getByRole("heading",{name:"Данные пациента",exact:true}).waitFor();
     const steps=page.locator('form[data-examination-steps] button');assert.equal(await steps.count(),4);for(let n=1;n<4;n++)assert.equal(await steps.nth(n).isDisabled(),true);
     await page.getByRole("button",{name:"EN",exact:true}).click();await page.getByRole("heading",{name:"Patient details",exact:true}).waitFor();
     await page.getByRole("button",{name:"RU",exact:true}).click();await page.getByRole("heading",{name:"Данные пациента",exact:true}).waitFor();
     await page.goto(`${origin}/history`);await page.getByRole("heading",{name:"История пациентов",exact:true}).waitFor();
     const find=page.getByRole("button",{name:"Найти",exact:true}),create=page.getByRole("link",{name:"Новый осмотр",exact:true});
     const appearance=await Promise.all([find,create].map(l=>l.evaluate(el=>{const css=getComputedStyle(el);return {background:css.backgroundColor,height:css.height,borderRadius:css.borderRadius};})));
     assert.deepEqual(appearance[0],appearance[1],"Find uses the same primary-button appearance as New examination");
     await page.getByRole("button",{name:"Период",exact:true}).click();const range=page.getByRole("dialog",{name:"Выбор периода",exact:true});await range.waitFor();
     const box=await range.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1,"History calendar stays within viewport");
     const days=range.locator('button[aria-pressed]');await days.nth(0).click();await days.nth(1).click();await range.getByRole("button",{name:"Готово",exact:true}).click();
     await page.locator('input[name="q"]').fill("Тестовый Пациент");await find.click();await page.waitForLoadState("networkidle");assert.ok(!page.url().includes("q="),"Patient search is absent from the URL");
     await page.reload();await page.getByRole("heading",{name:"История пациентов",exact:true}).waitFor();await page.getByRole("button",{name:"Сбросить",exact:true}).click();await page.waitForLoadState("networkidle");
     assert.equal(await page.locator('input[name="q"]').inputValue(),"");
     await page.screenshot({path:path.join(output,`${engine.toLowerCase()}-${width}-history.png`),fullPage:true});
     await page.goto(`${origin}/history/${examinationId}`);await page.getByRole("heading",{name:"Тестовый Пациент",exact:true}).waitFor();
     assert.ok(await page.getByRole("heading",{name:"История версий осмотра и комментария",exact:true}).isVisible());
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,"No horizontal page overflow");
     assert.deepEqual(errors,[],`${engine} ${width}: no console/hydration errors`);
     report.push({engine,width,calendar:true,reactionTime:true,symptomDropdown:true,clearVitalField:true,result:true,reload:true,language:true,privateSearch:true,consoleErrors:0});
    }finally{await context.close();}
   }
  }finally{await browser.close();}
 }
 await writeFile(path.join(output,"report.json"),JSON.stringify(report,null,2));console.log("Browser checks passed: Firefox + Chrome, 1440/390px, reload/hydration, calendars, time entry, RU/EN, private history search.");
}
