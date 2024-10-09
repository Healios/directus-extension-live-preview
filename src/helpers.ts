import { AxiosInstance } from "axios";
import { Relation, Field } from "@directus/types"

/**
 * 
 * @param api AxiosInstance from Directus useApi().
 * @returns All relations found in Directus.
 */
export async function getRelations(api: AxiosInstance): Promise<Relation[]>
{
    const relationsResponse = await api.get("/relations");

    if (relationsResponse.status !== 200)
    {
        console.error("[Live Preview] Unable to retrieve relations!");
        return [];
    }
    
    return relationsResponse.data.data as Relation[];
}

/**
 * 
 * @param relations Relations to look through.
 * @param fieldInfo Field to find relations for.
 * @returns Relations related to specified field.
 */
// export function getRelationsForField(relations: Relation[], fieldInfo: Field): Relation[]
// {
//     const foundRelations = relations.filter((relation: Relation) => (relation.collection === fieldInfo.collection && relation.field === fieldInfo.field) || (relation.related_collection === fieldInfo.collection && relation.meta?.one_field === fieldInfo.field));

//     if (foundRelations.length > 0)
//     {
//         const isM2M = foundRelations[0]!.meta?.junction_field !== null;

//         // If the relation matching the field has a junction field, it's a m2m. In that case,
//         // we also want to return the secondary relationship (from the jt to the related)
//         // so any ui elements (interfaces) can utilize the full relationship
//         if (isM2M)
//         {
//             const secondaryRelation = relations.find((relation) => relation.collection === foundRelations[0]!.collection && relation.field === foundRelations[0]!.meta?.junction_field);
//             if (secondaryRelation) foundRelations.push(secondaryRelation);
//         }
//     }

//     return foundRelations;
// }

/**
 * 
 * @param relations Relations to look through.
 * @param fieldInfo Field to find relations for.
 * @returns Relations related to specified field.
 */
function getRelationsForField(relations: Relation[], collection: string, field: string): Relation[]
{
    const foundRelations = relations.filter((relation: Relation) => (relation.collection === collection && relation.field === field) || (relation.related_collection === collection && relation.meta?.one_field === field));

    if (foundRelations.length > 0)
    {
        const isM2M = foundRelations[0]!.meta?.junction_field !== null;

        // If the relation matching the field has a junction field, it's a m2m. In that case,
        // we also want to return the secondary relationship (from the jt to the related)
        // so any ui elements (interfaces) can utilize the full relationship
        if (isM2M)
        {
            const secondaryRelation = relations.find((relation) => relation.collection === foundRelations[0]!.collection && relation.field === foundRelations[0]!.meta?.junction_field);
            if (secondaryRelation) foundRelations.push(secondaryRelation);
        }
    }

    return foundRelations;
}

export function getRelationType(fieldRelations: Relation[], collection: string, field: string): { type: "none" | "m2o" | "o2m" | "m2a", relation: Relation|undefined }
{
    // Check m2o.
    const m2o = fieldRelations.length === 1 && fieldRelations.some(fieldRelation => fieldRelation.meta?.many_collection === collection && fieldRelation.meta?.many_field === field && fieldRelation.related_collection);
    if (m2o) return { type: "m2o", relation: fieldRelations.find(fieldRelation => fieldRelation.meta?.many_collection === collection && fieldRelation.meta?.many_field === field && fieldRelation.related_collection) };

    // Check o2m.
    const o2m = fieldRelations.length === 1 && fieldRelations.some(fieldRelations => fieldRelations.meta?.one_collection === collection && fieldRelations.meta?.one_field == field);
    if (o2m) return { type: "o2m", relation: fieldRelations.find(fieldRelations => fieldRelations.meta?.one_collection === collection && fieldRelations.meta?.one_field == field && fieldRelations.meta?.many_collection !== collection) };

    // Check m2a.
    const m2a = fieldRelations.some(fieldRelations => fieldRelations.meta?.one_allowed_collections);
    if (m2a) return { type: "m2a", relation: fieldRelations.find(fieldRelations => fieldRelations.meta?.one_allowed_collections) };

    return { type: "none", relation: undefined };
}

async function getCollectionFields(api: AxiosInstance, collection: string): Promise<any>
{
    // Get more information about the current collection's fields.
    const fieldsResponse = await api.get(`/fields/${collection}`);
    if (fieldsResponse.status !== 200)
    {
        console.error(`[Live Preview] Unable to retrieve field information for collection ${collection}`);
        return undefined;
    }

    return fieldsResponse.data.data;
}

export async function getFieldsWithRelations(api: AxiosInstance, relations: Relation[], collection: string,
    path: string = "",
    visitedCollections: Set<string> = new Set(),
    result: { path: string, collection: string }[] = [],
    ignoredFields: string[] = []): Promise<{ path: string, collection: string}[]>
{
    // Prevent infinite loops by tracking visited collections
    if (visitedCollections.has(collection)) return result;
    visitedCollections.add(collection);

    // Get more information about the current collection's fields.
    const fields = await getCollectionFields(api, collection);

    for(const field of fields)
    {
        if (ignoredFields.includes(field.field)) continue;

        const fieldRelations = getRelationsForField(relations, field.collection, field.field);
        if (fieldRelations.length === 0) continue;

        // Build the current field path
        const fieldPath = path ? `${path}.${field.field}` : field.field;

        // Add the current field path and collection to the result list
        result.push({ path: fieldPath, collection });

        const relationType = getRelationType(fieldRelations, field.collection, field.field);

        switch (relationType.type)
        {
            case "m2o":
                // Many-to-one: Recursively fetch fields from the related collection
                if (relationType.relation?.related_collection)
                    await getFieldsWithRelations(api, relations, relationType.relation.related_collection, fieldPath, visitedCollections, result, ignoredFields);
                break;

            case "o2m":
                // One-to-many: Recursively fetch fields from the related collection (many side)
                if (relationType.relation?.meta?.many_collection)
                    await getFieldsWithRelations(api, relations, relationType.relation.meta.many_collection, fieldPath, visitedCollections, result, ignoredFields);
                break;

            case "m2a":
                // Many-to-any: Recursively fetch fields for each allowed collection
                if (relationType.relation?.meta?.one_allowed_collections)
                    for (const allowedCollection of relationType.relation.meta.one_allowed_collections)
                        await getFieldsWithRelations(api, relations, allowedCollection, fieldPath, visitedCollections, result, ignoredFields);
                break;
        }
    }

    return result;
}

export function findDifferences(obj1: any, obj2: any)
{
    let diffs: any = {};

    const deepDiff = (obj1: any, obj2: any, path = "") =>
    {
        if (obj1 === obj2) return;

        if (typeof obj1 !== "object" || typeof obj2 !== "object" || obj1 === null || obj2 === null)
        {
            diffs[path] = { obj1, obj2 };
            return;
        }

        if (Array.isArray(obj1) && Array.isArray(obj2))
        {
            let maxLength = Math.max(obj1.length, obj2.length);

            for (let i = 0; i < maxLength; i++)
                deepDiff(obj1[i], obj2[i], `${path}[${i}]`);

            return;
        }

        let keys1 = Object.keys(obj1);
        let keys2 = Object.keys(obj2);
        let allKeys = new Set([...keys1, ...keys2]);

        for (let key of allKeys)
        {
            let newPath = path ? `${path}.${key}` : key;

            if (!keys1.includes(key))
                diffs[newPath] = { obj1: undefined, obj2: obj2[key] };
            else if (!keys2.includes(key))
                diffs[newPath] = { obj1: obj1[key], obj2: undefined };
            else
                deepDiff(obj1[key], obj2[key], newPath);
        }
    }

    deepDiff(obj1, obj2);
    return diffs;
}

export function findCRUDProperties(obj: any, result: string[] = [], path = "")
{
    // Helper function to check if the object has "create", "update", and "delete" as array properties
    function isCRUDObject(o: any)
    {
        const hasCreate = o.hasOwnProperty("create") && Array.isArray(o.create);
        const hasUpdate = o.hasOwnProperty("update") && Array.isArray(o.update);
        const hasDelete = o.hasOwnProperty("delete") && Array.isArray(o.delete);
        return hasCreate && hasUpdate && hasDelete;
    }

    for (const key in obj)
    {
        const fullPath = path ? `${path}.${key}` : key;

        if (typeof obj[key] === "object" && obj[key] !== null)
        {
            // Store the path to the object
            if (isCRUDObject(obj[key])) result.push(fullPath); 

            // Recursively check nested objects and arrays of objects
            if (Array.isArray(obj[key]))
                obj[key].filter(item => typeof item === "object" && item !== null).forEach((item, index) => findCRUDProperties(item, result, `${fullPath}[${index}]`));
            else
                findCRUDProperties(obj[key], result, fullPath);
        }
    }

    return result;
}

export function resolvePropertyPath(path: string, obj: Record<string, any>)
{
    // Split the path while supporting array indices and dots
    const properties = path.replace(/\[(\d+)\]/g, ".$1").split(".");

    // Traverse the object based on the properties array
    return properties.reduce((prev, curr) => prev ? prev[curr] : undefined, obj);
}

export async function testRecursiveRelations(api: AxiosInstance, relations: Relation[], collection: string, item: any, oldFormValues: any, newFormValues: any)
{
    console.log("COLLECTION: " + collection);

    // Get current value.
    const value = { ...item };

    // Get more information about the current collection's fields.
    const fieldTypeResponse = await api.get(`/fields/${collection}`);
    if (fieldTypeResponse.status !== 200)
    {
        console.error(`[Live Preview] Unable to retrieve field information from collection ${collection}`);
        return value;
    }

    for(const field of Object.keys(value))
    {
        // Get more information about the current field.
        const fieldInfo = fieldTypeResponse.data.data.find((fieldInfo: Field) => fieldInfo.field === field) as Field;
        if (!fieldInfo)
        {
            // console.log(`Field: ${field} - exiting at fieldinfo`);
            continue;
        }

        // Get more information about the current fields relations.
        // const fieldRelations = getRelationsForField(relations, fieldInfo);
        // if (fieldRelations.length === 0)
        // {
        //     // console.log(`Field: ${field} - exiting at relation`);
        //     continue;
        // }

        // if (fieldRelations.length > 0)
        // {
        //     const relationType = getRelationType(fieldRelations, fieldInfo);

        //     switch(relationType.type)
        //     {
        //         case "none":
        //             value[field] = newFormValues[field];
        //             break;
    
        //         case "m2o":
        //             value[field] = await handleM2O(api, relations, value, oldFormValues, newFormValues, fieldInfo);
        //             break;
    
        //         case "o2m":
        //             value[field] = await handleO2M(api, relations, value, oldFormValues, newFormValues, fieldInfo);
        //             break;
    
        //         case "m2a":
        //             value[field] = await handleM2A(api, relations, value, oldFormValues, newFormValues, fieldInfo);
        //             break;
        //     }   
        // }
    }

    return value;
}

async function handleM2O(api: AxiosInstance, relations: Relation[], item: any, oldFormValues: any, newFormValues: any, fieldInfo: Field): Promise<any>
{
    // When the new value is null or undefined (it might be undefined when being recursive), simply set the value.
    if (newFormValues[fieldInfo.field] === null || newFormValues[fieldInfo.field] === undefined) return { ...item[fieldInfo.field] };

    // Skip, if there are no changes or if the new value is null.
    if (oldFormValues[fieldInfo.field] === newFormValues[fieldInfo.field]) return { ...item[fieldInfo.field] };

    // When a new item is created, but hasn't been saved, an object with the new values will be returned, instead of a string id.
    if (Object.prototype.toString.call(newFormValues[fieldInfo.field]) === "[object Object]") return { ...newFormValues[fieldInfo.field] };

    // Get the items foreign collection.
    const foreignCollection = fieldInfo.schema!.foreign_key_table;

    // Get new item value from foreign collection.
    const response = await api.get(`/items/${foreignCollection}/${newFormValues[fieldInfo.field]}?fields[]=*.*.*.*.*`);
    if (response.status !== 200)
    {
        console.error(`[Live Preview] Unable to retrieve information about item with id ${newFormValues[fieldInfo.field]} in foreign collection ${foreignCollection}`);
        return { ...item[fieldInfo.field] };
    }

    // Update the item value (there will most likely be more properties than originally, but that's ok, as it's all in a private preview).
    return { ...response.data.data };
}

async function handleO2M(api: AxiosInstance, relations: Relation[], item: any, oldFormValues: any, newFormValues: any, fieldInfo: Field): Promise<any>
{
    // Get current value.
    const value = [ ...item[fieldInfo.field] ];

    // Get changes.
    const changes = newFormValues[fieldInfo.field];

    // When an item is added, but not saved, and then removed, the value received from Directus is undefined for some reason.
    // In this case, we can fix it by finding the saved items and thereby resetting the value.
    if (changes === undefined) return value.filter((tempItem: any) => tempItem.id !== undefined);

    // Handle additions.
    const additions = changes["create"];
    if (additions?.length > 0)
    {
        for(const addition of additions)
        {
            // TODO: Figure out if the item not having an ID yet, will be bad for frontend?
            value.push({ ...addition });
        }
    }

    // Handle updates.
    const updates = changes["update"];
    if (updates?.length > 0)
    {           
        for(const update of updates)
        {
            // Get the item to update.
            const updateIndex = value.findIndex((tempItem: any) => tempItem.id === update.id);

            // Update the item value by merging existing values with the updated values.
            // Even if sort isn't enabled, items won't be rearranged incorrectly.
            value[updateIndex] = { sort: update?.sort ?? 0, ...value[updateIndex], ...update };
        }

        // Sort the items in ascending order (1,2,3,4,5).
        value.sort((itemA: any, itemB: any) => itemA.sort - itemB.sort);
    }

    // Handle deletes.
    const deletes = changes["delete"];
    if (deletes?.length > 0)
    {
        for(const deleteId of deletes)
        {
            const deleteIndex = value.findIndex((tempItem: any) => tempItem.id === deleteId);
            value.splice(deleteIndex, 1);
        }
    }

    return value;
}

async function handleM2A(api: AxiosInstance, relations: Relation[], item: any, oldFormValues: any, newFormValues: any, fieldInfo: Field): Promise<any>
{
    // Get current value.
    const value = [ ...item[fieldInfo.field] ];

    // Get changes.
    const changes = newFormValues[fieldInfo.field];

    // Handle additions.
    const additions = changes["create"];
    if (additions?.length > 0)
    {
        for(const addition of additions)
        {
            // We're adding an existing item.
            if (addition.item.id !== undefined)
            {
                const response = await api.get(`/items/${addition.collection}/${addition.item.id}?fields[]=*.*.*.*.*`);
                if (response.status !== 200)
                {
                    console.error(`[Live Preview] Unable to retrieve information about item with id ${addition.item.id} in collection ${addition.collection}`);
                    continue;
                }
    
                // Add the new item (__typename is added because I personally use it).
                value.push({ item: { __typename: addition.collection, ...response.data.data } });
            }
            // We're creating a new item.
            else
            {
                // Add the new item (__typename is added because I personally use it).
                value.push({ item: { __typename: addition.collection, ...addition.item } });
            }
        }
    }

    // Handle updates.
    const updates = changes["update"];
    if (updates?.length > 0)
    {
        for(const update of updates)
        {
            // Get the item to update.
            const updateIndex = value.findIndex((tempInfo: any) => tempInfo.item.id === update.item.id);

            // Update the item value by merging existing values with the updated values.
            // Even if sort isn't enabled, items won't be rearranged incorrectly.
            value[updateIndex] = { sort: update?.sort ?? 0, item: { ...value[updateIndex].item, ...update.item } };
        }

        // Sort the items in ascending order (1,2,3,4,5).
        value.sort((itemA: any, itemB: any) => itemA.sort - itemB.sort);
    }

    // Handle deletes.
    const deletes = changes["delete"];
    if (deletes?.length > 0)
    {
        for(const deleteId of deletes)
        {
            // Get relationship information, as we only have the id of the relationship in m2m collection.
            const response = await api.get(`/items/${fieldInfo.collection}_${fieldInfo.field}/${deleteId}`);
            if (response.status !== 200)
            {
                console.error(`[Live Preview] Unable to retrieve information about item with id ${deleteId} in collection ${fieldInfo.collection}_${fieldInfo.field}`);
                continue;
            }
            
            // With the collection id, we now find the item to delete.
            const deleteIndex = value.findIndex((tempItem: any) => tempItem.item.id === response.data.data.item);
            value.splice(deleteIndex, 1);
        }
    }

    return value;
}