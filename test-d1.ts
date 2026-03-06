
import Cloudflare from 'cloudflare';

async function main() {
    const cf = new Cloudflare({
        apiToken: 'gXK7cF0ThlkwieUk2WnsEgkQqVRgeC9xl5j5Kt7T'
    });

    const accountId = '2bb601259da4fa047868dd53ec3a313b';

    try {
        console.log('Listing D1 databases...');
        const databases = await cf.d1.database.list({
            account_id: accountId
        });
        console.log('Databases:', JSON.stringify(databases, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

main();
