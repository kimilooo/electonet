const fs = require('fs');
const https = require('https');

https.get('https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    fs.writeFileSync('chart.js', data);
    console.log('Downloaded chart.js successfully');
  });
}).on('error', (e) => {
  console.error(e);
});
