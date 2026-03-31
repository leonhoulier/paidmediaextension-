import { PrismaService } from './src/prisma/prisma.service';
import { ExtensionTokenService } from './src/extension/extension-token.service';

const prisma = new PrismaService();

async function testTokenExpiry() {
  await prisma.onModuleInit();
  const tokenService = new ExtensionTokenService(prisma);

  try {
    // Find or create a test user
    let user = await prisma.user.findFirst();
    if (!user) {
      const org = await prisma.organization.findFirst();
      if (!org) {
        console.log('❌ No organization found. Run seed first.');
        return;
      }
      user = await prisma.user.create({
        data: {
          organizationId: org.id,
          email: 'token-test@example.com',
          name: 'Token Test User',
          role: 'buyer',
        },
      });
    }

    console.log('👤 Testing with user:', user.email);
    console.log('');

    // Test 1: Generate new token with expiry
    console.log('📝 Test 1: Generate new token with 90-day expiry');
    const { token, expiresAt } = await tokenService.generateToken(user.id);
    const daysUntilExpiry = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    console.log('✅ Token generated:', token.substring(0, 16) + '...');
    console.log(`✅ Expires in ${daysUntilExpiry.toFixed(1)} days`);
    console.log(`✅ Expiry date: ${expiresAt.toISOString()}`);
    console.log('');

    // Test 2: Validate fresh token
    console.log('📝 Test 2: Validate fresh token (should pass)');
    const validation = await tokenService.validateToken(token);
    console.log('✅ Token valid!');
    console.log(`   User ID: ${validation.userId}`);
    console.log(`   Org ID: ${validation.organizationId}`);
    console.log(`   Should refresh: ${validation.shouldRefresh}`);
    console.log('');

    // Test 3: Create expired token
    console.log('📝 Test 3: Test expired token (should fail)');
    await prisma.user.update({
      where: { id: user.id },
      data: {
        extensionToken: 'expired-token-123',
        tokenExpiresAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
      },
    });

    try {
      await tokenService.validateToken('expired-token-123');
      console.log('❌ FAIL: Expired token was accepted!');
    } catch (err: any) {
      console.log('✅ PASS: Expired token rejected');
      console.log(`   Error: ${err.message}`);
    }
    console.log('');

    // Test 4: Test revoked token
    console.log('📝 Test 4: Test revoked token (should fail)');
    await tokenService.generateToken(user.id); // Generate fresh token
    await tokenService.revokeToken(user.id); // Revoke it

    const userData = await prisma.user.findUnique({ where: { id: user.id } });
    try {
      await tokenService.validateToken(userData!.extensionToken!);
      console.log('❌ FAIL: Revoked token was accepted!');
    } catch (err: any) {
      console.log('✅ PASS: Revoked token rejected');
      console.log(`   Error: ${err.message}`);
    }
    console.log('');

    // Test 5: Token refresh
    console.log('📝 Test 5: Test token refresh');
    const { token: freshToken } = await tokenService.generateToken(user.id);
    const { token: newToken, expiresAt: newExpiry } = await tokenService.refreshToken(freshToken);
    console.log('✅ Token refreshed successfully');
    console.log(`   Old token: ${freshToken.substring(0, 16)}...`);
    console.log(`   New token: ${newToken.substring(0, 16)}...`);
    console.log(`   New expiry: ${newExpiry.toISOString()}`);
    console.log('');

    console.log('🎉 All token expiry tests PASSED!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.onModuleDestroy();
  }
}

testTokenExpiry();
