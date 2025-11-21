<script lang="ts">
  import { Handle, Position, type NodeProps } from '@xyflow/svelte';
  import { onMount } from 'svelte';

  interface MyNodeProps extends NodeProps {
      data: {
          label: string;
          content?: string;
          initialFocus?: boolean;
          color?: string;
      }
  }

  let { data, sourcePosition = Position.Bottom, targetPosition = Position.Top, selected } = $props() as MyNodeProps;
  let labelTextarea: HTMLTextAreaElement | undefined = $state();

  onMount(() => {
      if (data.initialFocus && labelTextarea) {
          setTimeout(() => {
              labelTextarea?.focus();
              labelTextarea?.select();
              // Remove the flag to prevent re-focusing if persisted/reloaded
              delete data.initialFocus;
          }, 10);
      }
  });
  
  function handleLabelInput(e: Event) {
      const target = e.target as HTMLTextAreaElement;
      data.label = target.value;
      autoResize(target);
  }

  function handleContentInput(e: Event) {
      const target = e.target as HTMLTextAreaElement;
      data.content = target.value;
      autoResize(target);
  }

  function autoResize(el: HTMLTextAreaElement) {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
  }

  function resizeAction(el: HTMLTextAreaElement) {
      autoResize(el);
  }

  // Determine background style
  let bgStyle = $derived(data.color ? `background-color: ${data.color}; border-color: ${data.color};` : '');
  // If color is set, we might need to adjust text color, but for pastel colors black text is usually fine.
  // For dark mode, if a custom color is set, we might want to keep it or slightly darken it. 
  // For simplicity, we apply the color directly.
</script>

<div 
  class="relative px-4 py-2 shadow-md rounded-md border-2 transition-all duration-200 group"
  class:bg-white={!data.color}
  class:dark:bg-gray-800={!data.color}
  class:border-gray-200={!data.color}
  class:dark:border-gray-700={!data.color}
  style={bgStyle}
>
  <Handle type="target" position={targetPosition} class="w-3 h-3 bg-blue-500!" />
  
  <!-- Drag Handle Indicator (Floating above) -->
  <div class="absolute -top-5 left-0 right-0 flex justify-center items-center h-4 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity duration-200"
       class:opacity-100={selected}>
      <div class="w-16 h-1.5 rounded-full shadow-sm transition-colors duration-200"
           class:bg-blue-500={selected}
           class:bg-gray-400={!selected}
           class:dark:bg-gray-500={!selected}>
      </div>
  </div>

  <div class="flex flex-col gap-1">
      <textarea 
          bind:this={labelTextarea}
          value={data.label} 
          oninput={handleLabelInput}
          use:resizeAction
          rows="1"
          class="nodrag bg-transparent border-none focus:outline-none text-center w-full font-bold text-lg resize-none overflow-hidden" 
          class:text-gray-900={!data.color}
          class:dark:text-white={!data.color}
          class:text-black={!!data.color} 
          placeholder="Heading"
      ></textarea>
      
      {#if selected || (data.content && data.content.trim().length > 0)}
      <textarea
          value={data.content || ''}
          oninput={handleContentInput}
          use:resizeAction
          rows="1"
          class="nodrag bg-transparent border-none focus:outline-none w-full text-sm resize-none min-h-[60px] text-center font-sans overflow-hidden"
          class:text-gray-600={!data.color}
          class:dark:text-gray-300={!data.color}
          class:text-gray-800={!!data.color}
          placeholder="Description..."
      ></textarea>
      {/if}
  </div>
  
  <Handle type="source" position={sourcePosition} class="w-3 h-3 bg-blue-500!" />
</div>
