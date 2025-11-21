<script lang="ts">
  import { Handle, Position, type NodeProps } from '@xyflow/svelte';

  let { data } = $props() as NodeProps;
  
  function handleInput(e: Event) {
      const target = e.target as HTMLInputElement;
      // Mutating data.label should trigger updates in the parent if nodes is a $state proxy
      data.label = target.value;
  }
</script>

<div class="px-4 py-2 shadow-md rounded-md bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 min-w-[150px]">
  <Handle type="target" position={Position.Top} class="w-3 h-3 bg-blue-500!" />
  
  <input 
      value={data.label} 
      oninput={handleInput}
      class="nodrag bg-transparent border-none focus:outline-none text-center w-full text-gray-900 dark:text-white font-medium" 
      placeholder="Node Name"
  />
  
  <Handle type="source" position={Position.Bottom} class="w-3 h-3 bg-blue-500!" />
</div>
