<script setup lang="ts">
	import { inject, ref, onMounted, watch } from "vue";
	import { useApi } from "@directus/extensions-sdk";

	// Properties.
	interface Properties
	{
		collection: string;
		requestType: string;
		query: string;
		debugLogs: boolean;
	};
	const { collection, requestType, query, debugLogs } = defineProps<Properties>();

	// Fields.
	const api = useApi();
	const values = inject("values");
	const initialValues = ref<any|undefined>();
	const previewLastUpdated = ref<Date|undefined>();

	// Events.
	onMounted(async () =>
	{
		// Get preview URL from collection.
		const previewURL = await getPreviewURL();

		// Watch changes to form values.
		watch(values, async (newValue, oldValue) =>
		{
			// Get the initial values.
			if (!initialValues.value) initialValues.value = oldValue;

			if (debugLogs)
			{
				console.log("[Live Preview] Values received from form:");
				console.log(newValue);
			}

			// Get data of current viewed entity or exit.
			const entity = await getCollectionEntity(newValue.id);
			if (!entity) return;

			// Handle changes to related data (refactor this to work recursively, so it can be applied to properties of m2a items).
			const data = { ...entity["pages_by_id"] };
			for(const field of Object.keys(data))
			{
				// Get value of current field.
				const value = data[field];

				// Get more information about the current field.
				const fieldTypeResponse = await api.get(`/fields/${collection}`);
				if (fieldTypeResponse.status !== 200)
				{
					console.error(`[Live Preview] Unable to retrieve meta information about field ${field}`);
					return "";
				}
				const fieldInfo = fieldTypeResponse.data.data.find(fieldInfo => fieldInfo.field === field);

				// Simply override field value, if the field doesn't contain relation value.
				if (!fieldInfo.meta.special?.includes("m2o") && !fieldInfo.meta.special?.includes("o2m") && !fieldInfo.meta.special?.includes("m2a"))
				{
					data[field] = newValue[field];
				}
				else
				{
					if (fieldInfo.meta.special.includes("m2o"))
					{
						// Skip, if there are no changes.
						if (oldValue[field] === newValue[field]) continue;

						// Get foreign collection.
						const foreignCollection = fieldInfo.schema.foreign_key_table;

						// Get new value from foreign collection.
						const response = await api.get(`/items/${foreignCollection}/${newValue[field]}?fields[]=*.*.*.*.*`);
						if (response.status !== 200)
						{
							console.error(`[Live Preview] Unable to retrieve information about item with id ${newValue[field]} in foreign collection ${foreignCollection}`);
							return "";
						}

						// Update the field value (there will most likely be more properties than originally, but that's ok).
						data[field] = { ...response.data.data };
					}

					if (fieldInfo.meta.special.includes("o2m"))
					{
						// Get changes.
						const changes = newValue[field];
						//TODO: Handle when changes is undefined. This happens when we add a new item and then delete it again.

						// Handle additions.
						const additions = changes["create"];
						if (additions?.length > 0)
						{
							// Add the new items.
							for(const addition of additions)
							{
								// TODO: Figure out if the item not having an ID yet, will be bad for frontend?
								data[field].push({ ...addition });
							}
						}

						// Handle updates.
						const updates = changes["update"];
						if (updates?.length > 0)
						{
							for(const update of updates)
							{
								// Get the field to update.
								const updateIndex = data[field].findIndex(info => info.id === update.id);

								// Update the field value by merging existing values with the updated values.
								// Even if sort isn't enabled, items won't be rearranged incorrectly.
								data[field][updateIndex] = { sort: update?.sort ?? 0, ...data[field][updateIndex], ...update };
							}

							// Sort the items in ascending order (1,2,3,4,5).
							data[field].sort((itemA, itemB) => itemA.sort - itemB.sort);
						}

						// Handle deletes.
						const deletes = changes["delete"];
						if (deletes?.length > 0)
						{
							console.log(deletes);
							// for(const deleteId of deletes)
							// {
							// 	// Get relationship information, as we only have the id of the relationship in m2m collection.
							// 	const response = await api.get(`/items/${collection}_${field}/${deleteId}`);
							// 	if (response.status !== 200)
							// 	{
							// 		console.error(`[Live Preview] Unable to retrieve information about item with id ${deleteId} in collection ${collection}_${field}`);
							// 		return "";
							// 	}
								
							// 	// With the collection id, we now find the field value to delete.
							// 	const deleteIndex = data[field].findIndex(info => info.item.id === response.data.data.item);

							// 	// Remove the deleted field value.
							// 	data[field].splice(deleteIndex, 1);
							// }
						}
					}

					if (fieldInfo.meta.special.includes("m2a"))
					{
						// Get changes.
						const changes = newValue[field];

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

								// Add the 
								data[field].push({ item: { __typename: addition.collection, ...response.data.data } });
							}
						}

						// Handle updates.
						const updates = changes["update"];
						if (updates?.length > 0)
						{
							for(const update of updates)
							{
								// Get the field to update.
								const updateIndex = data[field].findIndex(info => info.item.id === update.item.id);

								// Update the field value by merging existing values with the updated values.
								data[field][updateIndex] = { sort: update?.sort ?? 0, item: { ...data[field][updateIndex].item, ...update.item } };
							}

							// Sort the items in ascending order (1,2,3,4,5).
							data[field].sort((itemA, itemB) => itemA.sort - itemB.sort);
						}

						// Handle deletes.
						const deletes = changes["delete"];
						if (deletes?.length > 0)
						{
							for(const deleteId of deletes)
							{
								// Get relationship information, as we only have the id of the relationship in m2m collection.
								const response = await api.get(`/items/${collection}_${field}/${deleteId}`);
								if (response.status !== 200)
								{
									console.error(`[Live Preview] Unable to retrieve information about item with id ${deleteId} in collection ${collection}_${field}`);
									return "";
								}
								
								// With the collection id, we now find the field value to delete.
								const deleteIndex = data[field].findIndex(info => info.item.id === response.data.data.item);

								// Remove the deleted field value.
								data[field].splice(deleteIndex, 1);
							}
						}
					}
				}
			}

			// Send entity data to the preview iframe.
			const previewFrame = document.getElementById("frame")?.contentWindow;
			if (previewFrame)
			{
				previewFrame.postMessage({ type: "directus-live-preview", values: data }, previewURL);
				previewLastUpdated.value = new Date();
			}

			if (debugLogs)
			{
				console.log("[Live Preview] Data sent to preview iframe:");
				console.log(data);
			}
		});
	});

	// Methods.
	const getPreviewURL = async (): string =>
	{
		const response = await api.get(`/collections/${collection}`);
		
		if (response.status !== 200)
		{
			console.error(`[Live Preview] Unable to retrieve information about collection ${collection}`);
			return "";
		}

		return response.data.data.meta.preview_url;
	};

	const getCollectionEntity = async (id: string): any =>
	{
		const response = requestType === "REST" ? await api.get(`/items/${collection}/${id}${query}`)
												: await api.post("/graphql", { query, variables: { id: id } });

		if (response.status !== 200)
		{
			console.error(`[Live Preview] Unable to retrieve entity with id ${id}`);
			return undefined;
		}

		return response.data.data;
	};
</script>

<template>
	<VNotice v-if="debugLogs && previewLastUpdated">
		Preview data last sent to preview iframe at {{ previewLastUpdated.toLocaleString() }}
		<br>
		Check browser console to see more details.
	</VNotice>
</template>