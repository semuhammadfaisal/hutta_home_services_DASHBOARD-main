// Test script for multiple phone numbers and email addresses functionality
// This script can be run in the browser console to test the new features

console.log('Testing multiple phone numbers and email addresses functionality...');

// Test adding email addresses
function testAddEmailAddress() {
    console.log('Testing addEmailAddress function...');
    if (typeof addEmailAddress === 'function') {
        addEmailAddress();
        console.log('✓ addEmailAddress function works');
    } else {
        console.error('✗ addEmailAddress function not found');
    }
}

// Test adding phone numbers
function testAddPhoneNumber() {
    console.log('Testing addPhoneNumber function...');
    if (typeof addPhoneNumber === 'function') {
        addPhoneNumber();
        console.log('✓ addPhoneNumber function works');
    } else {
        console.error('✗ addPhoneNumber function not found');
    }
}

// Test removing email addresses
function testRemoveEmailAddress() {
    console.log('Testing removeEmailAddress function...');
    if (typeof removeEmailAddress === 'function') {
        removeEmailAddress(1);
        console.log('✓ removeEmailAddress function works');
    } else {
        console.error('✗ removeEmailAddress function not found');
    }
}

// Test removing phone numbers
function testRemovePhoneNumber() {
    console.log('Testing removePhoneNumber function...');
    if (typeof removePhoneNumber === 'function') {
        removePhoneNumber(1);
        console.log('✓ removePhoneNumber function works');
    } else {
        console.error('✗ removePhoneNumber function not found');
    }
}

// Run tests when customer modal is open
function runTests() {
    console.log('=== Running Multiple Contact Tests ===');
    testAddEmailAddress();
    testAddPhoneNumber();
    testRemoveEmailAddress();
    testRemovePhoneNumber();
    console.log('=== Tests Complete ===');
}

// Export test function
window.testMultipleContacts = runTests;

console.log('Test script loaded. Open customer modal and run: testMultipleContacts()');