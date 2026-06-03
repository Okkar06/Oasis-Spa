#!/usr/bin/env node
/**
 * Database Connection Test Script
 * Run this to test your database connections and diagnose issues
 */

import 'dotenv/config';
import { getProdPool, getSimPool, checkDatabaseHealth } from './config/database.js';

async function testDatabaseConnections() {
  console.log('🔍 Testing Database Connections...\n');

  // Test Production Database
  console.log('📊 Testing Production Database:');
  try {
    const prodClient = await getProdPool().connect();
    console.log('✅ Production database connected successfully');
    
    // Test a simple query
    const result = await prodClient.query('SELECT NOW() as current_time, version() as version');
    console.log(`   📅 Database time: ${result.rows[0].current_time}`);
    console.log(`   🏷️  Database version: ${result.rows[0].version.split(' ').slice(0, 2).join(' ')}`);
    
    prodClient.release();
  } catch (error) {
    console.error('❌ Production database connection failed:', error instanceof Error ? error.message : error);
  }

  console.log();

  // Test Simulation Database
  console.log('🧪 Testing Simulation Database:');
  try {
    const simClient = await getSimPool().connect();
    console.log('✅ Simulation database connected successfully');
    
    // Test a simple query
    const result = await simClient.query('SELECT NOW() as current_time, version() as version');
    console.log(`   📅 Database time: ${result.rows[0].current_time}`);
    console.log(`   🏷️  Database version: ${result.rows[0].version.split(' ').slice(0, 2).join(' ')}`);
    
    simClient.release();
  } catch (error) {
    console.error('❌ Simulation database connection failed:', error instanceof Error ? error.message : error);
  }

  console.log();

  // Test Health Check Function
  console.log('🏥 Testing Database Health Check:');
  try {
    const health = await checkDatabaseHealth();
    console.log(`   Status: ${health.status}`);
    console.log(`   Message: ${health.message}`);
    console.log(`   Timestamp: ${health.timestamp}`);
  } catch (error) {
    console.error('❌ Health check failed:', error instanceof Error ? error.message : error);
  }

  console.log();

  // Display Pool Stats
  console.log('📊 Pool Statistics:');
  const prodPool = getProdPool();
  const simPool = getSimPool();

  console.log(`   Production Pool:`);
  console.log(`     Total connections: ${prodPool.totalCount}`);
  console.log(`     Idle connections: ${prodPool.idleCount}`);
  console.log(`     Waiting clients: ${prodPool.waitingCount}`);

  console.log(`   Simulation Pool:`);
  console.log(`     Total connections: ${simPool.totalCount}`);
  console.log(`     Idle connections: ${simPool.idleCount}`);
  console.log(`     Waiting clients: ${simPool.waitingCount}`);

  // Display Environment Variables (without sensitive data)
  console.log('\n🔧 Environment Configuration:');
  console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? 'Set' : 'Not set'}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'Not set'}`);

  console.log('\n✨ Database connection test completed!\n');
  
  // Keep alive for a few seconds to show any connection events
  console.log('⏳ Monitoring connection events for 5 seconds...');
  setTimeout(() => {
    console.log('📋 Test completed. Check the logs above for any connection issues.');
    process.exit(0);
  }, 5000);
}

testDatabaseConnections().catch((error) => {
  console.error('💥 Test failed:', error);
  process.exit(1);
});
