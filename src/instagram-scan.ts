import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const DATA_DIR = path.join(__dirname, '..', 'data');

const SESSION_ID = process.argv[2];
const USERNAME = process.argv[3] || 'zero.oge';

if (!SESSION_ID) {
  console.error('Usage: ts-node src/instagram-scan.ts <sessionid> [username]');
  process.exit(1);
}

const DECODED_SESSION = decodeURIComponent(SESSION_ID);

const HEADERS = {
  'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100)',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'X-IG-App-ID': '936619743392459',
  'Cookie': `sessionid=${DECODED_SESSION}`,
};

function fetchJson(url: string, maxRedirects = 3): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: { ...HEADERS },
      timeout: 20000,
    };
    const req = https.get(options, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && maxRedirects > 0) {
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : `https://${parsedUrl.hostname}${res.headers.location}`;
        console.log(`  Redirected to: ${redirectUrl.substring(0, 80)}`);
        fetchJson(redirectUrl, maxRedirects - 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          reject(new Error(`HTTP ${res.statusCode}: ${body.substring(0, 200)}`));
        });
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid JSON: ${data.substring(0, 200)}`));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('\n========================================');
  console.log(`  Instagram Scanner: @${USERNAME}`);
  console.log('========================================\n');

  // Step 1: Get user info via mobile API search
  console.log('Fetching user profile...');
  let userId: string;
  try {
    const searchData = await fetchJson(`https://i.instagram.com/api/v1/users/search/?q=${USERNAME}`);
    const user = searchData.users?.find((u: any) => u.username === USERNAME);
    if (!user) {
      console.error('Could not find user. Check username and session cookie.');
      process.exit(1);
    }
    userId = user.pk.toString();
    console.log(`  User: ${user.full_name} (@${user.username})`);
    console.log(`  User ID: ${userId}`);
    console.log(`  Private: ${user.is_private}`);

    // Step 2: Get user info for post count
    try {
      const userInfo = await fetchJson(`https://i.instagram.com/api/v1/users/${userId}/info/`);
      const postCount = userInfo.user?.media_count || '?';
      console.log(`  Posts: ${postCount}`);
      console.log(`  Bio: ${userInfo.user?.biography || ''}`);
    } catch { /* non-critical */ }

    // Step 3: Fetch posts via feed endpoint
    console.log('\nFetching posts...');
    await fetchViaFeedApi(userId);
  } catch (error: any) {
    console.error(`Error fetching profile: ${error.message}`);
    process.exit(1);
  }

  // Save results
  saveResults();
}

const allPosts: any[] = [];

async function processEdges(edges: any[]) {
  for (const edge of edges) {
    const node = edge.node;
    const caption = node.edge_media_to_caption?.edges?.[0]?.node?.text || '';
    const imageUrl = node.display_url || node.thumbnail_src || '';
    const shortcode = node.shortcode;
    const timestamp = node.taken_at_timestamp;
    const isCarousel = node.__typename === 'GraphSidecar';

    // Get all images for carousel posts
    const images: string[] = [imageUrl];
    if (isCarousel && node.edge_sidecar_to_children?.edges) {
      for (const child of node.edge_sidecar_to_children.edges) {
        const childUrl = child.node?.display_url;
        if (childUrl && !images.includes(childUrl)) {
          images.push(childUrl);
        }
      }
    }

    allPosts.push({
      shortcode,
      caption,
      imageUrl,
      images,
      timestamp,
      date: timestamp ? new Date(timestamp * 1000).toISOString().split('T')[0] : undefined,
      postUrl: `https://www.instagram.com/p/${shortcode}/`,
      isCarousel,
    });

    const preview = caption.substring(0, 80).replace(/\n/g, ' ');
    console.log(`  [${allPosts.length}] ${preview}...`);
  }
}

async function fetchViaFeedApi(userId: string) {
  let maxId: string | undefined;
  let page = 0;

  while (page < 10) {
    page++;
    const url = maxId
      ? `https://i.instagram.com/api/v1/feed/user/${userId}/?count=12&max_id=${maxId}`
      : `https://i.instagram.com/api/v1/feed/user/${userId}/?count=12`;

    console.log(`  Fetching feed page ${page}...`);
    try {
      const data = await fetchJson(url);
      const items = data.items || [];
      if (items.length === 0) break;

      for (const item of items) {
        const caption = item.caption?.text || '';
        const imageUrl = item.image_versions2?.candidates?.[0]?.url || '';
        const shortcode = item.code;
        const timestamp = item.taken_at;

        const images: string[] = [imageUrl];
        if (item.carousel_media) {
          for (const media of item.carousel_media) {
            const mediaUrl = media.image_versions2?.candidates?.[0]?.url;
            if (mediaUrl && !images.includes(mediaUrl)) {
              images.push(mediaUrl);
            }
          }
        }

        allPosts.push({
          shortcode,
          caption,
          imageUrl,
          images,
          timestamp,
          date: timestamp ? new Date(timestamp * 1000).toISOString().split('T')[0] : undefined,
          postUrl: `https://www.instagram.com/p/${shortcode}/`,
          isCarousel: (item.carousel_media?.length || 0) > 0,
        });

        const preview = caption.substring(0, 80).replace(/\n/g, ' ');
        console.log(`    [${allPosts.length}] ${preview}...`);
      }

      if (!data.more_available) break;
      maxId = data.next_max_id;
      await delay(2000);
    } catch (error: any) {
      console.error(`    Feed error: ${error.message}`);
      break;
    }
  }
}

function saveResults() {
  console.log('\n========================================');
  console.log('  SCAN COMPLETE');
  console.log('========================================');
  console.log(`  Total posts: ${allPosts.length}`);

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `instagram-${USERNAME}-${dateStr}.json`;
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify({ posts: allPosts, scannedAt: new Date().toISOString() }, null, 2));
  console.log(`  Saved to: ${filepath}`);

  // Print all captions for review
  console.log('\n--- All Post Captions ---\n');
  for (const post of allPosts) {
    console.log(`[${post.date}] ${post.postUrl}`);
    console.log(post.caption.substring(0, 200));
    console.log('---');
  }
}

main().catch(console.error);
