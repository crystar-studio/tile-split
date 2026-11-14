const { test, expect } = require('@playwright/test');
async function load(page,w=800,h=200){
  const buffer=await page.evaluate(({w,h})=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#123456';x.fillRect(0,0,w,h);return c.toDataURL().split(',')[1];},{w,h});
  await page.locator('#file').setInputFiles({name:'テスト.png',mimeType:'image/png',buffer:Buffer.from(buffer,'base64')});
  await expect(page.locator('#editor')).toBeVisible();
}
test('exports PNG/JPG/WebP and a valid UTF-8 ZIP',async({page})=>{
  await page.goto('/');await load(page);
  await page.locator('#gapOn').uncheck();await page.locator('#resetBtn').click();
  for(const fmt of ['png','jpg','webp']){
    await page.locator(`[data-f="${fmt}"]`).click();await page.locator('#genBtn').click();
    await expect(page.locator('#thumbs button')).toHaveCount(4);
    const output=await page.evaluate(()=>({types:S.results.map(r=>r.blob.type),widths:pieces().p.map(p=>p.w)}));
    expect(output.types).toEqual(Array(4).fill(fmt==='jpg'?'image/jpeg':`image/${fmt}`));
    expect(output.widths).toEqual([200,200,200,200]);
  }
  const bytes=await page.evaluate(async()=>Array.from(new Uint8Array(await (await makeZip(S.results)).arrayBuffer())));
  const fs=require('fs'),os=require('os'),path=require('path');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tilesplit-'));const zip=path.join(dir,'test.zip');fs.writeFileSync(zip,Buffer.from(bytes));
  require('child_process').execFileSync('python3',['-c','import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert len(z.namelist())==4; assert z.namelist()[0]=="テスト_01.webp"',zip]);
  fs.rmSync(dir,{recursive:true});
});
test('small image and 100 cuts stay ordered after moving a line',async({page})=>{
  await page.goto('/');await load(page,20,10);await page.locator('#count').fill('100');await page.locator('#count').dispatchEvent('change');
  const valid=await page.evaluate(()=>{S.cuts[30]=0.9;fixCuts();return pieces().p.every(p=>p.w>0&&p.x>=-0.00001&&p.x+p.w<=S.W+0.00001);});expect(valid).toBe(true);
});
test('settings changed during export discard stale output and allow retry',async({page})=>{
  await page.goto('/');await load(page);
  await page.evaluate(()=>{const original=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(cb,...args){return original.call(this,b=>setTimeout(()=>cb(b),150),...args);};});
  await page.locator('#genBtn').click();await page.locator('[data-n="8"]').click();
  await expect(page.locator('#genBtn')).toBeEnabled();await expect(page.locator('#saveArea')).toBeHidden();
  await page.locator('#genBtn').click();await expect(page.locator('#thumbs button')).toHaveCount(8);
});
test('failed canvas export restores controls',async({page})=>{
  await page.goto('/');await load(page);await page.evaluate(()=>{HTMLCanvasElement.prototype.toBlob=function(cb){cb(null);};});
  await page.locator('#genBtn').click();await expect(page.locator('#genBtn')).toBeEnabled();await expect(page.locator('#status')).toHaveClass(/err/);
});
test('mobile layout, languages and sharing metadata',async({page})=>{
  await page.setViewportSize({width:375,height:812});await page.goto('/');
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content','summary_large_image');
  expect((await page.request.get('/assets/ogp.png')).ok()).toBe(true);
  for(const lang of ['en','zh-CN','zh-TW','ko','es','fr','pt','ja']){await page.locator('#lang').selectOption(lang);await expect(page.locator('html')).toHaveAttribute('lang',lang);}
  await load(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
