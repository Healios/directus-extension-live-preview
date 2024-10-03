import { defineInterface } from "@directus/extensions-sdk";
import InterfaceComponent from "./interface.vue";

export default defineInterface({
	id: "live-preview",
	name: "Live Preview",
	description: "Enables live preview in Directus. No longer will you have to deal with manually saving to preview, and no longer will you have to deal with the resulting back-button loop.",
	icon: "box",
	component: InterfaceComponent,
	types: [ "alias" ],
	localTypes: [ "presentation" ],
	group: "presentation",
	options: [
		{
			field: "requestType",
			name: "Request type",
			type: "string",
			meta: {
				width: "full",
				interface: "select-dropdown",
				options: {
					choices: [
						{
							text: "REST",
							value: "REST"
						},
						{
							text: "GraphQL",
							value: "GraphQL"
						}
					]
				},
			},
			schema: {
				default_value: "REST",
			}
		},
		{
			field: "query",
			name: "Query",
			type: "text",
			meta: {
				width: "full",
				interface: "text",
			},
			schema: {
				default_value: "",
			},
		},
		{
			field: 'debugLogs',
			name: 'Debug logs',
			type: 'boolean',
			meta: {
				width: 'half',
				interface: 'boolean',
				options: {
					label: 'Debug logs',
				},
			},
			schema: {
				default_value: false,
			},
		},
	],
	autoKey: true,
	hideLabel: true,
});
