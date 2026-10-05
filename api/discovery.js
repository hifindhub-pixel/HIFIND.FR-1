import marque from '../scripts/discovery/marque.js';
import marques from '../scripts/discovery/marques.js';
import baisses from '../scripts/discovery/baisses-prix.js';
import tendances from '../scripts/discovery/tendances.js';
const handlers = {marque, marques, 'baisses-prix':baisses, tendances};
export default function handler(req,res) {
  const type=req.query.pageType;
  if(typeof type!=='string'||!Object.hasOwn(handlers,type)) return res.status(404).send('Page introuvable');
  return handlers[type](req,res);
}
