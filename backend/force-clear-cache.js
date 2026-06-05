// Run this script to force clear the stats cache
// Make sure your server is running first!

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n CLEAR STATS CACHE\n');
console.log('This will force refresh the dashboard KPIs.');
console.log('Make sure your server is running!\n');

rl.question('Enter your auth token (from browser localStorage): ', async (token) => {
  if (!token) {
    console.log(' Token required');
    process.exit(1);
  }

  try {
    const fetch = require('node-fetch');
    
    const response = await fetch('http://localhost:3000/api/orders/clear-cache', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      console.log('\n Stats cache cleared!');
      console.log('Refresh your browser to see updated KPIs.');
    } else {
      console.log('\n Failed:', response.status, response.statusText);
    }
  } catch (error) {
    console.error('\n Error:', error.message);
    console.log('\nMake sure your server is running on http://localhost:3000');
  }
  
  rl.close();
  process.exit(0);
});
