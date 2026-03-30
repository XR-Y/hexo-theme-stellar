/**
 * Builds JSON-LD structured data for current page according to its type (page or post).
 *
 * @returns {string} - JSON-LD structured data
 */
'use strict';

const util = require('hexo-util');

function toIso(value) {
  if (!value) return null;
  if (typeof value.format === 'function') {
    return value.format();
  }
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
  
hexo.extend.helper.register('json_ld', function(args) {
  const page = this.page;
  const config = this.config;
  const structured_data = this.theme.structured_data;
  const authorEmail = config.email;
  const authorImage = config.avatar || (authorEmail ? this.gravatar(authorEmail) : null);
  const isPage = page.layout == 'page';
  const displayDate = this.get_post_display_date?.(page) || page.date || page.updated;

  const author = {
    '@type': 'Person',
    name: config.author,
    sameAs: structured_data.sameAs || []
  };
  const publisher = Object.assign({}, author, {'@type': 'Organization'});
  let schema = {};

  if (authorImage) {
    author.image = authorImage;
    publisher.image = authorImage;
    publisher.logo = {
      '@type': 'ImageObject',
      url: authorImage
    };
  }

  if (this.is_post()) {
    schema = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      author: author,
      dateCreated: toIso(displayDate),
      dateModified: toIso(displayDate),
      datePublished: toIso(displayDate),
      description: this.strip_html(page.excerpt),
      headline: page.title,
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': this.pretty_url(page.permalink)
      },
      publisher,
      url: this.pretty_url(page.permalink)
    };

    if (page.tags && page.tags.length > 0) {
      schema.keywords = page.tags.map((tag) => tag.name).join(', ');
    }

    let images = [];
    if (page.photos && page.photos.length > 0) {
      images = images.concat(page.photos);
    }

    if (page.cover?.length > 0) {
      images = images.unshift(page.cover);
    } else if (page.banner?.length > 0) {
      images = images.unshift(page.banner);
    }

    schema.thumbnailUrl = page.cover || page.banner;
    schema.image = images;
  } else if (isPage || this.is_home()) {
    const url = this.is_home() ? config.url : this.pretty_url(page.permalink);
    schema = {
      '@context': 'https://schema.org',
      '@type': 'Website',
      '@id': url,
      author: author,
      name: page.title || config.title,
      description: config.description,
      url: url
    };

    if (config.keywords && config.keywords.length) {
      if (Array.isArray(args)) {
        schema.keywords = config.keywords.join(', ');
      } else {
        schema.keywords = config.keywords;
      }
    }
    if (!this.is_home()) {
      if (page.excerpt || page.description) {
        schema.description = this.strip_html(page.description || page.excerpt);
      } else {
        schema.description = util.truncate(this.strip_html(page.content), {length: 200});
      }
    }
  } else {
    schema = {
      '@context': 'https://schema.org',
      '@type': 'Website',
      '@id': config.url,
      author: author,
      name: config.title,
      description: config.description,
      url: config.url
    };
  }

  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
});
