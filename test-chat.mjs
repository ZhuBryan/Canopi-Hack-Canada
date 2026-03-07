fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'places near google hq' }] })
})
    .then(res => res.json())
    .then(data => console.log(data.content))
    .catch(console.error);
