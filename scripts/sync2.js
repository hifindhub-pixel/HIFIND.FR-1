async function main() {
  console.log('TEST START');
  try {
    const res = await fetch('https://priceminister.effiliation.com/output/commun/effiliation_ARTS-COLLECTIONS_NEW.xml');
    console.log('STATUS:', res.status);
    const text = await res.text();
    console.log('SIZE:', text.length);
    console.log('START:', text.slice(0, 500));
  } catch(e) {
    console.log('ERROR:', e.message);
  }
}
main();
