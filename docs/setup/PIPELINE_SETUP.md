# Pipeline Stages Database Setup

## Initialize the 10 Permanent Pipeline Stages

### Step 1: Navigate to backend directory
```bash
cd backend
```

### Step 2: Run the initialization script
```bash
node init-pipeline-stages.js
```

This will create the following 10 stages in your MongoDB database:

1. **Work Order Received** - Initial work order intake
2. **Bidding** - Preparing bid for client
3. **Bid Submitted to Client** - Awaiting client decision
4. **Approved – Ready to Schedule** - Client approved, ready for scheduling
5. **In Progress** - Work is being performed
6. **Awaiting Documentation** - Work complete, gathering documents
7. **Ready to Invoice** - Ready to send invoice
8. **Invoice Sent** - Invoice sent to client
9. **Paid** - Payment received
10. **Closed** - Project completed and closed

### Step 3: Verify stages were created
The script will output confirmation and list all created stages.

### Step 4: Restart your server
```bash
npm start
```

## API Endpoints

The following endpoints are now available:

- `GET /api/stages` - Get all stages
- `POST /api/stages` - Create new stage
- `PUT /api/stages/:id` - Update stage
- `DELETE /api/stages/:id` - Delete stage
- `PATCH /api/stages/reorder` - Reorder stages

## Notes

- The script will only create stages if none exist in the database
- Running it multiple times is safe - it won't create duplicates
- Stages are stored permanently in MongoDB
- The frontend will automatically fetch stages from the database
