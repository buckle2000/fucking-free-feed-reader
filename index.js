const yaml = require('js-yaml')
const fs = require('fs')
const pug = require('pug')
const request = require('request')
const FeedParser = require('feedparser')

const config = yaml.safeLoad(fs.readFileSync('config.yml', 'utf8'))

const {
  categories
} = config
const promise_pool = []
const feed_data = []
const category_name_to_feeds = new Map()

for (const {
    name: category_name,
    feeds
  } of categories) {
  category_name_to_feeds.set(category_name, [])
  for (const {
      name: feed_name,
      uri
    } of feeds) {
    const feedparser = new FeedParser()
    const req = request.get(uri)
    req.pipe(feedparser)
    promise_pool.push(new Promise((resolve, reject) => {
      const items = []
      feedparser.on('readable', function () {
        let item
        while (item = this.read()) {
          items.push(item)
        }
      })
      feedparser.on('meta', function () {
        let date
        if (this.meta.date instanceof Date) date = this.meta.date.toISOString()
        else if (this.meta.pubdate) date = this.meta.pubdate.toISOString()
        feed_data.push({
          feed_name,
          title: this.meta.title,
          date,
          link: this.meta.link
        })
      })
      feedparser.on('end', function () {
        for (const item of items) {
          let date
          if (item.date instanceof Date) date = item.date.toISOString()
          else if (item.pubdate) date = item.pubdate.toISOString()
          category_name_to_feeds.get(category_name).push({
            feed_name,
            feed_link: item.meta.link,
            title: item.title,
            // description: item.description, // 正文 TODO maybe use this some way
            // summary: item.summary, // TODO maybe use this some way
            link: item.link,
            date,
            author: item.author,
            guid: item.guid // TODO use this to track if I have read this
          })
        }
        resolve()
      })
      req.on('error', reject)
      feedparser.on('error', reject)
    }))
  }
}

try {
  Promise.all(promise_pool).then(() => {
    const item_data = []
    for (const [key, value] of category_name_to_feeds.entries()) {
      item_data.push({
        name: key,
        items: value.sort((a,b)=>a.date<b.date?1:-1)
      })
    }
    console.log('Load data done')
    // fs.writeFileSync('test/feed_data.json', JSON.stringify(feed_data), 'utf8')
    // fs.writeFileSync('test/item_data.json', JSON.stringify(item_data), 'utf8')
    const template = pug.compileFile('template.pug')
    console.log('Compile done')
    const file_content = template({
      now: new Date().toISOString(),
      feed_data: feed_data.sort((a,b)=>a.date<b.date?1:-1),
      item_data
    })
    fs.writeFileSync('test/output.html', file_content, 'utf8')
  })
} catch (error) {
  console.error(error)
  throw error
}