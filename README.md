# Live Preview
The extension enables live preview functionality in Directus, by pushing updates to the preview iframe in realtime. This extension also pushes relationship data, when configured to do so.

## Installation
Install from the Marketplace, or refer to the [Official Guide]("https://docs.directus.io/extensions/installing-extensions.html#installing-via-the-npm-registry") for details on installing the extension manually.

## Usage in Directus
1. Enable preview on a collection.
2. Add a "Live Preview" field to the collection.
3. Specify whether to use **REST** or **GraphQL** requests.
4. **REST**
    1. When using the request type REST, you can optionally specify query parameters in the "Query" option (see ["Global Query Parameters"](https://docs.directus.io/reference/query.html)).  
       E.g.:
       ```
       ?fields[]=*&fields[]=blocks.item:hero_blocks.*&fields[]=blocks.item:contact_form_blocks.*
       ```
5. **GraphQL**
    1. When using the request type GraphQL, you must specify a query with the parameter "id".  
       E.g.:
       ```graphql
       query pages_by_id($id: ID!) {
            pages_by_id(id: $id) {
                ...Page
            }
        }
       ```
6. Optionally enable debugging logs. Very useful when setting up live preview.

## Usage in frontend
```javascript
window.addEventListener("message", (event) =>
{
    const { type, values } = event.data;
    if (type !== "directus-live-preview") return;

    // Grab the entity data.
    pageData.value = values.pages_by_id;
}, false);
```

## Attribution
The Directus extension "directus-extension-live-preview-sync" by [@br41nslug](https://github.com/br41nslug/), inspired this extension (the basic approach and the whole postMessage thing).