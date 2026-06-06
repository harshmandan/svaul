<script lang="ts">
    import SheetExample from "./SheetExample.svelte";
</script>

<!-- Content-sized (not full height) with the Submit button right after the fields,
     so the keyboard lift just moves the sheet up and scrolls the focused field into
     view — no gap opens between the inputs and the button. -->
<SheetExample
    name="Form & keyboard"
    description="Stays above the mobile keyboard."
    heading="Get in touch"
    showFooter={false}
>
    {#snippet body(controls)}
        <form
            class="mx-auto mt-3 flex w-full max-w-md flex-col gap-3"
            onsubmit={(e) => {
                e.preventDefault();
                controls.close();
            }}
        >
            <input
                class="rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
                placeholder="Name"
            />
            <input
                class="rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
                type="email"
                placeholder="Email"
            />
            <textarea
                class="rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
                rows="3"
                placeholder="Message"
            ></textarea>
            <button
                type="submit"
                class="mt-1 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
            >
                Submit
            </button>
        </form>
    {/snippet}
</SheetExample>
