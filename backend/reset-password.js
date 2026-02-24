require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    
    const User = mongoose.model('User', new mongoose.Schema({
      email: String,
      password: String,
      firstName: String,
      lastName: String,
      role: String,
      isActive: Boolean
    }));
    
    const email = 'sefaisal17@gmail.com';
    const newPassword = 'admin123';
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    const result = await User.updateOne(
      { email },
      { $set: { password: hashedPassword } }
    );
    
    console.log('Password reset result:', result);
    console.log(`\nLogin credentials:\nEmail: ${email}\nPassword: ${newPassword}`);
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
