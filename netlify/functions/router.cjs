// Dynamic imports also support existing Netlify projects pinned to older Lambda runtimes.
let modules;
exports.handler = async event => {
  modules ||= Promise.all([
    import('../../api/products.js'),
    import('../../api/flights.js'),
    import('../../api/img.js'),
    import('../../api/engagement.js'),
    import('../../api/categorie.js'),
    import('../../api/discovery.js'),
    import('../../api/marchand.js'),
    import('../../api/marchands.js'),
    import('../../api/produit.js'),
    import('../../api/sitemap.js'),
    import('../../scripts/netlify-adapter.js'),
  ]);
  const [products, flights, img, engagement, categorie, discovery, marchand, marchands, produit, sitemap, adapter] = await modules;
  return adapter.dispatch(event, {
    products: products.default,
    flights: flights.default,
    img: img.default,
    engagement: engagement.default,
    categorie: categorie.default,
    discovery: discovery.default,
    marchand: marchand.default,
    marchands: marchands.default,
    produit: produit.default,
    sitemap: sitemap.default,
  });
};
