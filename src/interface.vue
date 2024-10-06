<script setup lang="ts">
	import { inject, ref, onMounted, watch } from "vue";
	import { useApi } from "@directus/extensions-sdk";
	import { Relation, Field } from "@directus/types";
	import { getRelations, testRecursiveRelations } from "./helpers";

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
	const values = inject<any>("values");
	const previewLastUpdated = ref<Date|undefined>();

	// Events.
	onMounted(async () =>
	{
		// Get preview URL from collection.
		const previewURL = await getPreviewURL();

		// Get relations.
		const relations = await getRelations(api);
		if (relations.length === 0) return;

		// Watch changes to form values.
		watch(values, async (newValue, oldValue) =>
		{
			if (debugLogs)
			{
				console.log("[Live Preview] Values received from form:");
				console.log(newValue);
			}

			// Get current item or exit.
			const item = await getItem(newValue.id);
			if (!item) return;

			// Handle changes to related items (refactor this to work recursively, so it can be applied to properties of m2a items).
			let data = { ...item["pages_by_id"] };
			data = await testRecursiveRelations(api, relations, collection, data, oldValue, newValue);

			// Send item to the preview iframe.
			const previewFrame = (document.getElementById("frame") as HTMLIFrameElement)?.contentWindow;
			if (previewFrame)
			{
				previewFrame.postMessage({ type: "directus-live-preview", values: data }, previewURL);
				previewLastUpdated.value = new Date();
			}

			if (debugLogs)
			{
				console.log("[Live Preview] Item sent to preview iframe:");
				console.log(data);
			}
		});
	});

	// Methods.
	const getPreviewURL = async (): Promise<string> =>
	{
		const response = await api.get(`/collections/${collection}`);
		
		if (response.status !== 200)
		{
			console.error(`[Live Preview] Unable to retrieve information about collection ${collection}`);
			return "";
		}

		return response.data.data.meta.preview_url;
	};

	const getItem = async (id: string): Promise<any> =>
	{
		const response = requestType === "REST" ? await api.get(`/items/${collection}/${id}${query}`)
												: await api.post("/graphql", { query, variables: { id: id } });

		if (response.status !== 200)
		{
			console.error(`[Live Preview] Unable to retrieve item with id ${id}`);
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