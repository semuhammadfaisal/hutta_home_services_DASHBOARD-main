# Pipeline Stage Management - Quick Reference

## Adding a New Stage

1. Click the **"+ Add Stage"** button in the Pipeline header
2. Enter a stage name (e.g., "Lead", "Qualified", "Proposal", "Negotiation", "Closed Won", "Closed Lost")
3. Click **"Save Stage"**
4. The new stage will appear at the end of your pipeline

## Editing a Stage

1. Click the **edit icon** (pencil) on the stage header
2. Modify the stage name
3. Click **"Save Stage"**

## Deleting a Stage

1. Click the **delete icon** (trash) on the stage header
2. Confirm the deletion
3. **Note:** You cannot delete a stage that contains records. Move or delete the records first.

## Reordering Stages

1. Click and drag a stage column to reorder
2. Drop it in the desired position
3. The order is automatically saved

## Common Pipeline Stages

### Sales Pipeline
- Lead
- Qualified
- Proposal Sent
- Negotiation
- Closed Won
- Closed Lost

### Service Pipeline
- New Request
- Quoted
- Scheduled
- In Progress
- Completed
- Paid

### Project Pipeline
- Discovery
- Planning
- Design
- Development
- Testing
- Deployment
- Closed

## Tips

- Keep stage names short and clear
- Use consistent naming conventions
- Limit to 5-7 stages for optimal visibility
- Order stages from left to right in your workflow sequence
- The first stage typically represents new/incoming items
- The last stage typically represents completed/closed items

## Troubleshooting

**"Failed to save stage" error:**
- Make sure you entered a stage name
- Check that the backend server is running
- Verify MongoDB connection is active

**Cannot delete stage:**
- Move all records out of the stage first
- Or delete the records in that stage
- Empty stages can be deleted

**Stage not appearing:**
- Refresh the page
- Check browser console for errors
- Verify the stage was saved in the database
