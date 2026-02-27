const mongoose = require('mongoose');
require('dotenv').config();

async function fixVendors() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Drop the vendors collection completely
    await mongoose.connection.db.dropCollection('vendors').catch(() => {
      console.log('Vendors collection does not exist, will create new one');
    });
    
    console.log('Vendors collection dropped');
    
    // Define the correct schema with explicit subdocument
    const documentSchema = new mongoose.Schema({
      name: { type: String, required: true },
      url: { type: String, required: true },
      type: { type: String, required: true },
      size: { type: Number, required: true },
      uploadedAt: { type: Date, default: Date.now }
    }, { _id: false });
    
    const vendorSchema = new mongoose.Schema({
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: String,
      address: String,
      category: { 
        type: String, 
        enum: ['electrical', 'plumbing', 'civil', 'carpentry', 'hvac', 'painting', 'cleaning'], 
        required: true 
      },
      rating: { type: Number, min: 1, max: 5, default: 5 },
      isActive: { type: Boolean, default: true },
      documents: { type: [documentSchema], default: [] }
    }, { timestamps: true });
    
    // Create model
    const Vendor = mongoose.model('Vendor', vendorSchema);
    
    // Create a test vendor to ensure schema is correct
    const testVendor = new Vendor({
      name: 'Test Vendor',
      email: 'test@vendor.com',
      phone: '1234567890',
      address: 'Test Address',
      category: 'electrical',
      rating: 5,
      isActive: true,
      documents: [{
        name: 'test.pdf',
        url: '/uploads/test.pdf',
        type: 'application/pdf',
        size: 1024
      }]
    });
    
    await testVendor.save();
    console.log('Test vendor created successfully with documents');
    
    // Delete test vendor
    await Vendor.findByIdAndDelete(testVendor._id);
    console.log('Test vendor deleted');
    
    console.log('✅ Vendors collection fixed successfully!');
    console.log('You can now restart your server and try adding vendors with documents.');
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixVendors();
