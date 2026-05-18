import * as module from "@minecraft/server"
import * as util from "./utilities.js"
import './main2.js'

module.world.afterEvents.playerPlaceBlock.subscribe( data => util.init( data.block ) )

module.world.afterEvents.playerBreakBlock.subscribe( data => util.init( data.block ) )

module.world.afterEvents.itemStopUseOn.subscribe(e => {

  const BLOCK = e.source.getBlockFromViewDirection().block
  const blockName = BLOCK.typeId.split(':')[1]

  if ( /double_\w+_slab/.test(blockName) ) util.init( BLOCK, e.source.dimension )
})