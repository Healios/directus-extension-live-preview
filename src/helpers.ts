import { AxiosInstance } from "axios";
import { Relation, Field } from "@directus/types"
import { getRelationType } from "@directus/utils";

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

export function getRelationsForCollection(relations: Relation[], collection: string)
{
    return relations.filter((relation: Relation) => relation.collection === collection || relation.related_collection === collection);
};

export function getRelationsForField(relations: Relation[], fieldInfo: Field): Relation[]
{
    const foundRelations = relations.filter((relation: Relation) => (relation.collection === fieldInfo.collection && relation.field === fieldInfo.field) || (relation.related_collection === fieldInfo.collection && relation.meta?.one_field === fieldInfo.field));

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
};

export function getRelationForField(relations: Relation[], fieldInfo: Field): Relation | null
{
    const foundRelations = relations.filter((relation: Relation) => (relation.collection === fieldInfo.collection && relation.field === fieldInfo.field) || (relation.related_collection === fieldInfo.collection && relation.meta?.one_field === fieldInfo.field));
    return foundRelations.find((relation) => relation.collection === fieldInfo.collection && relation.field === fieldInfo.field) || null;
};

export async function testRecursiveRelations(api: AxiosInstance, relations: Relation[], collection: string, item: any)
{
    // Get more information about the current collection's fields.
    const fieldTypeResponse = await api.get(`/fields/${collection}`);
    if (fieldTypeResponse.status !== 200)
    {
        console.error(`[Live Preview] Unable to retrieve field information from collection ${collection}`);
        return "";
    }

    for(const field of Object.keys(item))
    {
        // Get more information about the current field.
        const fieldInfo = fieldTypeResponse.data.data.find((fieldInfo: Field) => fieldInfo.field === field) as Field;
        if (!fieldInfo)
        {
            console.log(`Field: ${field} - exiting at fieldinfo`);
            continue;
        }

        // Get more information about the current fields relations.
        const fieldRelations = getRelationsForField(relations, fieldInfo);
        if (fieldRelations.length === 0)
        {
            console.log(`Field: ${field} - exiting at relation`);
            continue;
        }
        const fieldRelation = fieldRelations.find(relation => relation.meta?.one_collection === fieldInfo.collection && relation.meta?.one_field === fieldInfo.field);
        if (!fieldRelation) continue;
        const fieldRelationType = getRelationType({ relation: fieldRelation, collection: fieldInfo.collection, field: fieldInfo.field });
        console.log(`Field: ${field} - type: ${fieldRelationType}`);
    }

    return;
}

export async function updateRelatedItemsRecursively(api: AxiosInstance, relations: Relation[], collection: string, item: any, oldFormValues: any, newFormValues: any)
{
    // Get more information about the current collection's fields.
    const fieldTypeResponse = await api.get(`/fields/${collection}`);
    if (fieldTypeResponse.status !== 200)
    {
        console.error(`[Live Preview] Unable to retrieve field information from collection ${collection}`);
        return "";
    }

    for(const field of Object.keys(item))
    {
        // Get more information about the current field.
        const fieldInfo = fieldTypeResponse.data.data.find((fieldInfo: Field) => fieldInfo.field === field) as Field;
        if (!fieldInfo) continue;

        switch (true)
        {
            case fieldInfo.meta?.special?.includes("m2o"):
                await handleM2O(api, relations, item, oldFormValues, newFormValues, fieldInfo);
                break;

            case fieldInfo.meta?.special?.includes("o2m"):
                await handleO2M(api, relations, item, oldFormValues, newFormValues, fieldInfo);
                break;

            case fieldInfo.meta?.special?.includes("m2m"):
                break;

            case fieldInfo.meta?.special?.includes("m2a"):
                await handleM2A(api, item, newFormValues, fieldInfo);
                break;
                
            // When the field isn't a relation type field, simply override the value.
            default:
                item[field] = newFormValues[field];
                break;
        }
    }

    return;
};

async function handleM2O(api: AxiosInstance, relations: Relation[], item: any, oldFormValues: any, newFormValues: any, fieldInfo: Field)
{
    // When the new value is null, simply set the value.
    if (newFormValues[fieldInfo.field] === null)
    {
        item[fieldInfo.field] = newFormValues[fieldInfo.field];
        return;
    }

    // Skip, if there are no changes or if the new value is null.
    if (oldFormValues[fieldInfo.field] === newFormValues[fieldInfo.field]) return;

    // When a new item is created, but hasn't been saved, an object with the new values will be returned, instead of a string id.
    if (Object.prototype.toString.call(newFormValues[fieldInfo.field]) === "[object Object]")
    {
        item[fieldInfo.field] = newFormValues[fieldInfo.field];
        return;
    }

    // Get the items foreign collection.
    const foreignCollection = fieldInfo.schema!.foreign_key_table;

    // Get new item value from foreign collection.
    const response = await api.get(`/items/${foreignCollection}/${newFormValues[fieldInfo.field]}?fields[]=*.*.*.*.*`);
    if (response.status !== 200)
    {
        console.error(`[Live Preview] Unable to retrieve information about item with id ${newFormValues[fieldInfo.field]} in foreign collection ${foreignCollection}`);
        return "";
    }

    // Update the item value (there will most likely be more properties than originally, but that's ok, as it's all in a private preview).
    item[fieldInfo.field] = { ...response.data.data };
    return;
};

async function handleO2M(api: AxiosInstance, relations: Relation[], item: any, oldFormValues: any, newFormValues: any, fieldInfo: Field)
{
    // Get changes.
    const changes = newFormValues[fieldInfo.field];

    // When an item is added, but not saved, and then removed, the value received from Directus is undefined for some reason.
    // In this case, we can fix it by finding the saved items and thereby resetting the value.
    if (changes === undefined)
    {
        item[fieldInfo.field] = item[fieldInfo.field].filter((tempItem: any) => tempItem.id !== undefined);
        return;
    }

    // Handle additions.
    const additions = changes["create"];
    if (additions?.length > 0)
    {
        for(const addition of additions)
        {
            // TODO: Figure out if the item not having an ID yet, will be bad for frontend?
            item[fieldInfo.field].push({ ...addition });
        }
    }

    // Handle updates.
    const updates = changes["update"];
    if (updates?.length > 0)
    {
        for(const update of updates)
        {
            // Get the item to update.
            const updateIndex = item[fieldInfo.field].findIndex((tempItem: any) => tempItem.id === update.id);

            // Update the item value by merging existing values with the updated values.
            // Even if sort isn't enabled, items won't be rearranged incorrectly.
            item[fieldInfo.field][updateIndex] = { sort: update?.sort ?? 0, ...item[fieldInfo.field][updateIndex], ...update };

            // const relation = getRelationForField(relations, fieldInfo);
            // if (relation === undefined) continue;
            // console.log(relation);
            // await updateRelatedItemsRecursively(api, relations, relation.collection, item[fieldInfo.field][updateIndex], oldFormValues, newFormValues);
        }

        // Sort the items in ascending order (1,2,3,4,5).
        item[fieldInfo.field].sort((itemA: any, itemB: any) => itemA.sort - itemB.sort);
    }

    // Handle deletes.
    const deletes = changes["delete"];
    if (deletes?.length > 0)
    {
        for(const deleteId of deletes)
        {
            const deleteIndex = item[fieldInfo.field].findIndex((tempItem: any) => tempItem.id === deleteId);
            item[fieldInfo.field].splice(deleteIndex, 1);
        }
    }

    return;
};

async function handleM2M()
{
    return;
};

async function handleM2A(api: AxiosInstance, item: any, newFormValues: any, fieldInfo: Field)
{
    // Get changes.
    const changes = newFormValues[fieldInfo.field];

    // Handle additions.
    const additions = changes["create"];
    if (additions?.length > 0)
    {
        for(const addition of additions)
        {
            const response = await api.get(`/items/${addition.collection}/${addition.item.id}?fields[]=*.*.*.*.*`);
            if (response.status !== 200)
            {
                console.error(`[Live Preview] Unable to retrieve information about item with id ${addition.item.id} in collection ${addition.collection}`);
                return "";
            }

            // Add the new item (__typename is added because I personally use it).
            item[fieldInfo.field].push({ item: { __typename: addition.collection, ...response.data.data } });
        }
    }

    // Handle updates.
    const updates = changes["update"];
    if (updates?.length > 0)
    {
        for(const update of updates)
        {
            // Get the item to update.
            const updateIndex = item[fieldInfo.field].findIndex((tempInfo: any) => tempInfo.item.id === update.item.id);

            // Update the item value by merging existing values with the updated values.
            // Even if sort isn't enabled, items won't be rearranged incorrectly.
            item[fieldInfo.field][updateIndex] = { sort: update?.sort ?? 0, item: { ...item[fieldInfo.field][updateIndex].item, ...update.item } };
        }

        // Sort the items in ascending order (1,2,3,4,5).
        item[fieldInfo.field].sort((itemA: any, itemB: any) => itemA.sort - itemB.sort);
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
                return "";
            }
            
            // With the collection id, we now find the item to delete.
            const deleteIndex = item[fieldInfo.field].findIndex((tempItem: any) => tempItem.item.id === response.data.data.item);
            item[fieldInfo.field].splice(deleteIndex, 1);
        }
    }

    return;
};