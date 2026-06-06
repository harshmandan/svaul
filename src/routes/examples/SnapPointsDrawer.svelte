<script lang="ts">
    import SheetExample from "./SheetExample.svelte";
    import type { SnapPoint } from "$lib/index.js";

    // Faithful reproduction of vaul's snap-points example: three points + course card.
    const points: SnapPoint[] = ["164px", "364px", 1];
</script>

<SheetExample
    name="Snap points"
    description="Rests at three heights; tap the handle to cycle."
    heading="The Hidden Details"
    snapPoints={points}
    showFooter={false}
>
    {#snippet body(controls)}
        <div
            class="mx-auto flex w-full max-w-md flex-col text-left text-gray-600 {controls.activeSnapPoint ===
            1
                ? 'overflow-y-auto'
                : 'overflow-hidden'}"
        >
            <div class="flex">
                {#each Array(5) as _, i (i)}
                    <svg
                        class="h-5 w-5 shrink-0 {i < 4
                            ? 'text-yellow-400'
                            : 'text-gray-300'}"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                    >
                        <path
                            fill-rule="evenodd"
                            d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z"
                            clip-rule="evenodd"
                        />
                    </svg>
                {/each}
            </div>
            <p class="mt-3 text-sm text-gray-500">
                2 modules, 27 hours of video
            </p>
            <p class="mt-4">
                The world of user interface design is an intricate landscape
                filled with hidden details and nuance. In this course, you will
                learn something cool. To the untrained eye, a beautifully
                designed UI.
            </p>
            <button
                class="mt-8 h-12 shrink-0 rounded-md bg-gray-900 font-medium text-gray-50"
            >
                Buy for $199
            </button>
            <div class="mt-12">
                <h3 class="text-xl font-medium text-gray-900">
                    Module 01. The Details
                </h3>
                <div class="mt-4 space-y-4">
                    <div>
                        <span class="block text-gray-900">Layers of UI</span
                        ><span>A basic introduction to Layers of Design.</span>
                    </div>
                    <div>
                        <span class="block text-gray-900">Typography</span><span
                            >The fundamentals of type.</span
                        >
                    </div>
                    <div>
                        <span class="block text-gray-900">UI Animations</span
                        ><span
                            >Going through the right easings and durations.</span
                        >
                    </div>
                </div>
            </div>
            <figure class="mt-12">
                <blockquote class="font-serif text-gray-700">
                    “I especially loved the hidden details video. That was so
                    useful, learned a lot by just reading it. Can't wait for
                    more course content!”
                </blockquote>
                <figcaption class="mt-2 text-sm text-gray-500">
                    Yvonne Ray, Frontend Developer
                </figcaption>
            </figure>
            <div class="mt-12">
                <h3 class="text-xl font-medium text-gray-900">
                    Module 02. The Process
                </h3>
                <div class="mt-4 space-y-4">
                    <div>
                        <span class="block text-gray-900">Build</span><span
                            >Create cool components to practice.</span
                        >
                    </div>
                    <div>
                        <span class="block text-gray-900">User Insight</span
                        ><span>Find out what users think and fine-tune.</span>
                    </div>
                    <div>
                        <span class="block text-gray-900"
                            >Putting it all together</span
                        ><span
                            >Let's build an app together and apply everything.</span
                        >
                    </div>
                </div>
            </div>
        </div>
    {/snippet}
</SheetExample>
