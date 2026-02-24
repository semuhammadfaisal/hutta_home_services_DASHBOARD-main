// Initialize Pipeline Stages in Database
const mongoose = require('mongoose');
require('dotenv').config();

const stageSchema = new mongoose.Schema({
    name: { type: String, required: true },
    position: { type: Number, required: true },
    description: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const Stage = mongoose.model('Stage', stageSchema);

const defaultStages = [
    { name: 'Work Order Received', position: 1, description: 'Initial work order intake' },
    { name: 'Bidding', position: 2, description: 'Preparing bid for client' },
    { name: 'Bid Submitted to Client', position: 3, description: 'Awaiting client decision' },
    { name: 'Approved – Ready to Schedule', position: 4, description: 'Client approved, ready for scheduling' },
    { name: 'In Progress', position: 5, description: 'Work is being performed' },
    { name: 'Awaiting Documentation', position: 6, description: 'Work complete, gathering documents' },
    { name: 'Ready to Invoice', position: 7, description: 'Ready to send invoice' },
    { name: 'Invoice Sent', position: 8, description: 'Invoice sent to client' },
    { name: 'Paid', position: 9, description: 'Payment received' },
    { name: 'Closed', position: 10, description: 'Project completed and closed' }
];

async function initializeStages() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Check if stages already exist
        const existingStages = await Stage.countDocuments();
        
        if (existingStages > 0) {
            console.log(`${existingStages} stages already exist. Skipping initialization.`);
            process.exit(0);
        }

        // Insert default stages
        await Stage.insertMany(defaultStages);
        console.log('✓ Successfully initialized 10 pipeline stages');
        
        // Display created stages
        const stages = await Stage.find().sort({ position: 1 });
        console.log('\nCreated stages:');
        stages.forEach(stage => {
            console.log(`  ${stage.position}. ${stage.name}`);
        });

        process.exit(0);
    } catch (error) {
        console.error('Error initializing stages:', error);
        process.exit(1);
    }
}

initializeStages();
