// Reuse evidence across offers of the exact same barcode, never a manufacturer prefix.
export function reconcileCategories(rows, decisions) {
  const groups=new Map();
  rows.forEach((p,i)=>{
    if(!/^\d{13}$/.test(String(p.ean||'')))return;
    if(!groups.has(p.ean))groups.set(p.ean,[]);
    groups.get(p.ean).push(i);
  });
  const out=decisions.map(d=>({...d}));
  for(const indexes of groups.values()){
    const known=indexes.map(i=>decisions[i]).filter(d=>d.category!=='autres' && d.score>=10);
    const cats=new Set(known.map(d=>d.category));
    if(cats.size!==1)continue;
    const allCats=new Set(indexes.map(i=>decisions[i].category).filter(c=>c!=='autres'));
    if(allCats.size!==1)continue;
    const brands=new Set(indexes.map(i=>String(rows[i].brand||'').toLowerCase().replace(/[^a-z0-9]/g,'')).filter(Boolean));
    if(brands.size>1)continue;
    for(const i of indexes)if(out[i].category==='autres')out[i]={category:known[0].category,source:'consensus-ean',score:10};
  }
  return out;
}
