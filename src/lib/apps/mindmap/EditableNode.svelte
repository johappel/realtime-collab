<script lang="ts">
  import { Handle, Position, type NodeProps } from '@xyflow/svelte';
  import { onMount } from 'svelte';

  interface MyNodeProps extends NodeProps {
      data: {
          label: string;
          content?: string;
          initialFocus?: boolean;
      }
  }

  let { data, sourcePosition = Position.Bottom, targetPosition = Position.Top } = $props() as MyNodeProps;
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
</script>

<div class="px-4 py-2 shadow-md rounded-md bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700">
  <Handle type="target" position={targetPosition} class="w-3 h-3 bg-blue-500!" />
  
  <div class="flex flex-col gap-1">
      <textarea 
          bind:this={labelTextarea}
          value={data.label} 
          oninput={handleLabelInput}
          use:resizeAction
          rows="1"
          class="nodrag bg-transparent border-none focus:outline-none text-center w-full text-gray-900 dark:text-white font-bold text-lg resize-none overflow-hidden" 
          placeholder="Heading"
      ></textarea>
      
      <textarea
          value={data.content || ''}
          oninput={handleContentInput}
          use:resizeAction
          rows="1"
          class="nodrag bg-transparent border-none focus:outline-none w-full text-gray-600 dark:text-gray-300 text-sm resize-none min-h-[60px] text-center font-sans overflow-hidden"
          placeholder="Description..."
      ></textarea>
  </div>
  
  <Handle type="source" position={sourcePosition} class="w-3 h-3 bg-blue-500!" />
</div>
