module.exports = {
  use: {
    headless: true,
    launchOptions: {
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  },
  reporter: 'list'
};
