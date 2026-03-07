import fs from 'fs';
fetch('http://localhost:3000/')
    .then(res => res.text())
    .then(text => fs.writeFileSync('error.html', text))
    .catch(console.error);
