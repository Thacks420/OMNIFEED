const { expo } = require('./app.json');
module.exports = { ...expo, plugins: [...(expo.plugins ?? []), './plugins/with-local-api'] };
