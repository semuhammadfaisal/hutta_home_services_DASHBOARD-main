const mongoose = require('mongoose');
require('dotenv').config();

const Stage = require('./models/Stage');
const PipelineRecord = require('./models/PipelineRecord');

const defaultStages = [
    { name: 'Work Order Received', position: 1 },
    { name: 'Bidding', position: 2 },
    { name: 'Bid Submitted to Client', position: 3 },
    { name: 'Approved – Ready to Schedule', position: 4 },
    { name: 'In Progress', position: 5 },
    { name: 'Awaiting Documentation', position: 6 },
    { name: 'Ready to Invoice', position: 7 },
    { name: 'Invoice Sent', position: 8 },
    { name: 'Paid', position: 9 },
    { name: 'Closed', position: 10 }
];

async function initializePipeline() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const existingStages = await Stage.find();
        
        if (existingStages.length === 0) {
            console.log('Initializing default stages...');
            const stages = await Stage.insertMany(defaultStages);
            console.log(`Created ${stages.length} default stages`);

            // Add sample records
            const sampleRecords = [
                { stageId: stages[0]._id, projectName: 'Kitchen Renovation', customerName: 'John Smith', priority: 'high', description: 'Complete kitchen remodel' },
                { stageId: stages[0]._id, projectName: 'Bathroom Repair', customerName: 'Sarah Johnson', priority: 'medium', description: 'Fix plumbing issues' },
                { stageId: stages[1]._id, projectName: 'Roof Replacement', customerName: 'Mike Davis', priority: 'high', description: 'Replace old roof' },
                { stageId: stages[4]._id, projectName: 'Electrical Upgrade', customerName: 'Emily Brown', priority: 'medium', description: 'Upgrade electrical panel' },
                { stageId: stages[4]._id, projectName: 'HVAC Installation', customerName: 'David Wilson', priority: 'low', description: 'Install new HVAC system' }
            ];

            await PipelineRecord.insertMany(sampleRecords);
            console.log(`Created ${sampleRecords.length} sample records`);
        } else {
            console.log(`Pipeline already initialized with ${existingStages.length} stages`);
        }

        await mongoose.disconnect();
        console.log('Initialization complete');
    } catch (error) {
        console.error('Error initializing pipeline:', error);
        process.exit(1);
    }
}

initializePipeline();
