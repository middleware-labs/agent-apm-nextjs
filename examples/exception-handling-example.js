/**
 * Exception Handling Examples for Next.js APM
 * 
 * This file demonstrates various ways to use the exception handling features
 * in your Next.js application with Middleware's APM.
 */

// @ts-ignore
import tracker from '@middleware.io/agent-apm-nextjs';

// Example 1: API Route with Exception Handling
// pages/api/users/[id].js or app/api/users/[id]/route.js

async function getUserHandler(req, res) {
    const { id } = req.query;
    
    // This might throw an exception if user is not found
    const user = await findUserById(id);
    
    // This will throw if user.profile is undefined
    const profile = user.profile.data;
    
    res.json({ user: profile });
}

// Wrapped handler for export
export const wrappedGetUserHandler = tracker.wrapAPIHandler(getUserHandler);

// Example 2: Middleware with Exception Handling
// middleware.js

async function authMiddleware(request) {
    const token = request.headers.get('authorization');
    
    if (!token) {
        throw new Error('Authorization token is required');
    }
    
    // This might throw if token is invalid
    const user = await validateToken(token);
    
    if (!user.isActive) {
        throw new Error('User account is not active');
    }
    
    return NextResponse.next();
}

// Wrapped middleware for export
export const wrappedAuthMiddleware = tracker.wrapMiddleware(authMiddleware);

// Example 3: Server Component with Exception Handling
// app/components/UserProfile.tsx

function UserProfileComponent({ userId }) {
    // This might throw if userId is invalid
    const user = getUserFromDatabase(userId);
    
    if (!user) {
        throw new Error(`User not found: ${userId}`);
    }
    
    // This will throw if user.profile is undefined
    const profileData = user.profile.personal;
    
    return (
        <div>
            <h1>{profileData.name}</h1>
            <p>{profileData.email}</p>
        </div>
    );
}

// Wrapped component for export
export const WrappedUserProfileComponent = tracker.wrapServerComponent(UserProfileComponent);

// Example 4: Manual Exception Capture

export async function processPayment(paymentData) {
    try {
        // Your payment processing logic
        const result = await chargeCard(paymentData);
        return result;
    } catch (error) {
        // Manually capture the exception with additional context
        tracker.captureException(error, {
            userId: paymentData.userId,
            amount: paymentData.amount,
            paymentMethod: paymentData.method,
            feature: 'payment-processing',
            severity: 'high'
        });
        
        // Re-throw or handle as needed
        throw new Error('Payment processing failed');
    }
}

// Example 5: Complex Error Handling in API Route

async function complexAPIHandler(req, res) {
    const { orderId } = req.body;
    
    try {
        // Step 1: Validate order
        const order = await validateOrder(orderId);
        
        // Step 2: Process payment
        const payment = await processPayment(order.paymentInfo);
        
        // Step 3: Update inventory
        await updateInventory(order.items);
        
        // Step 4: Send confirmation
        await sendConfirmationEmail(order.customerEmail);
        
        res.json({ success: true, orderId: order.id });
        
    } catch (error) {
        // Capture the exception with order context
        tracker.captureException(error, {
            orderId: orderId,
            step: getFailedStep(error),
            customerEmail: order?.customerEmail,
            totalAmount: order?.total,
            feature: 'order-processing'
        });
        
        res.status(500).json({ 
            error: 'Order processing failed',
            orderId: orderId 
        });
    }
}

export const wrappedComplexAPIHandler = tracker.wrapAPIHandler(complexAPIHandler);

// Example 6: Custom Error Class with Exception Handling

class PaymentError extends Error {
    constructor(message, code, details) {
        super(message);
        this.name = 'PaymentError';
        this.code = code;
        this.details = details;
    }
}

export async function processSubscription(subscriptionData) {
    try {
        const customer = await createCustomer(subscriptionData.customerInfo);
        
        if (!customer.isEligible) {
            throw new PaymentError(
                'Customer is not eligible for subscription',
                'CUSTOMER_NOT_ELIGIBLE',
                { customerId: customer.id, reason: customer.ineligibilityReason }
            );
        }
        
        const subscription = await createSubscription(customer.id, subscriptionData.plan);
        return subscription;
        
    } catch (error) {
        // The exception handler will automatically capture:
        // - The custom error type (PaymentError)
        // - The stack trace including function bodies
        // - Git information about the current deployment
        
        // Add manual context if needed
        if (error instanceof PaymentError) {
            tracker.captureException(error, {
                errorCode: error.code,
                errorDetails: error.details,
                feature: 'subscription-processing',
                planType: subscriptionData.plan?.type
            });
        }
        
        throw error;
    }
}

// Example 7: Async/Await Error Handling Pattern

async function dataProcessingEndpoint(req, res) {
    const { dataId } = req.params;
    
    try {
        // Chain of async operations that might fail
        const rawData = await fetchRawData(dataId);
        const validatedData = await validateDataFormat(rawData);
        const processedData = await transformData(validatedData);
        const savedData = await saveToDatabase(processedData);
        
        res.json({ success: true, id: savedData.id });
        
    } catch (error) {
        // Automatic exception capture will include:
        // - Full stack trace showing which async operation failed
        // - Function body of the failing function
        // - Line numbers and context around the error
        
        tracker.captureException(error, {
            dataId: dataId,
            stage: 'data-processing',
            dataSize: rawData?.length || 0,
            processingStep: determineFailedStep(error)
        });
        
        res.status(500).json({
            error: 'Data processing failed',
            dataId: dataId,
            message: error.message
        });
    }
}

export const wrappedDataProcessingEndpoint = tracker.wrapAPIHandler(dataProcessingEndpoint);

// Utility functions (these would be implemented in your actual application)

async function findUserById(id) {
    // Mock implementation
    if (id === 'invalid') {
        throw new Error('Invalid user ID format');
    }
    return { id, profile: { data: { name: 'John Doe' } } };
}

async function validateToken(token) {
    // Mock implementation
    if (!token.startsWith('valid-')) {
        throw new Error('Invalid token format');
    }
    return { isActive: true };
}

function getUserFromDatabase(userId) {
    // Mock implementation
    if (userId === 'missing') {
        return null;
    }
    return { id: userId, profile: { personal: { name: 'John', email: 'john@example.com' } } };
}

async function chargeCard(paymentData) {
    // Mock implementation
    if (paymentData.amount > 10000) {
        throw new Error('Amount exceeds limit');
    }
    return { transactionId: 'tx_123', status: 'success' };
}

function getFailedStep(error) {
    // Determine which step failed based on error message
    if (error.message.includes('validate')) return 'validation';
    if (error.message.includes('payment')) return 'payment';
    if (error.message.includes('inventory')) return 'inventory';
    if (error.message.includes('email')) return 'notification';
    return 'unknown';
}

async function validateOrder(orderId) {
    // Mock implementation
    return { id: orderId, total: 100, customerEmail: 'customer@example.com' };
}

function determineFailedStep(error) {
    // Analyze error to determine processing step
    const stack = error.stack;
    if (stack.includes('fetchRawData')) return 'fetch';
    if (stack.includes('validateDataFormat')) return 'validation';
    if (stack.includes('transformData')) return 'transformation';
    if (stack.includes('saveToDatabase')) return 'persistence';
    return 'unknown';
}

// Mock functions for examples
async function createCustomer() { return { id: '123', isEligible: true }; }
async function createSubscription() { return { id: 'sub_123' }; }
async function updateInventory() { return true; }
async function sendConfirmationEmail() { return true; }
async function fetchRawData() { return 'data'; }
async function validateDataFormat(data) { return data; }
async function transformData(data) { return data; }
async function saveToDatabase(data) { return { id: 'saved_123' }; } 