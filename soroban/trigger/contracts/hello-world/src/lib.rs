#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, contracterror, Env, String, Symbol, Map, symbol_short};
use wee_alloc::WeeAlloc;

#[global_allocator]
static ALLOC: WeeAlloc = WeeAlloc::INIT;

#[contract]
pub struct Contract;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Trigger {
    trigger_type: String,
    phase: String,
    title: String,
    source: String,
    river_basin: String,
    params_hash: String,
    is_mandatory: bool,
    is_triggered: bool,
}

#[contracttype]
pub enum TriggerEvent {
    Added(Symbol, Trigger),
    Triggered(Symbol, Trigger),
    Updated(Symbol, Trigger), // Event type for parameter updates
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum TriggerError {
    TriggerAlreadyExists = 1,
    TriggerNotFound = 2,
    InvalidTriggerState = 3, // New error for invalid trigger state changes
}

#[contractimpl]
impl Contract {
    pub fn add_trigger(
        env: Env,
        id: Symbol,
        trigger_type: String,
        phase: String,
        title: String,
        source: String,
        river_basin: String,
        params_hash: String,
        is_mandatory: bool,
    ) -> Result<(), TriggerError> {
        let trigger_key = symbol_short!("triggers");

        let mut triggers: Map<Symbol, Trigger> = env
            .storage()
            .persistent()
            .get(&trigger_key)
            .unwrap_or(Map::new(&env));

        if triggers.contains_key(id.clone()) {
            return Err(TriggerError::TriggerAlreadyExists);
        }

        let trigger = Trigger {
            trigger_type,
            phase,
            title,
            source,
            river_basin,
            params_hash,
            is_mandatory,
            is_triggered: false,
        };

        triggers.set(id.clone(), trigger.clone());
        env.storage().persistent().set(&trigger_key, &triggers);

        env.events().publish(("TriggerEvent", "Added"), TriggerEvent::Added(id, trigger));
        
        Ok(())
    }

    pub fn get_trigger(env: Env, id: Symbol) -> Option<Trigger> {
        let trigger_key = symbol_short!("triggers");
        let triggers: Map<Symbol, Trigger> = env
            .storage()
            .persistent()
            .get(&trigger_key)
            .unwrap_or(Map::new(&env));

        triggers.get(id)
    }

    pub fn update_trigger_params(
        env: Env, 
        id: Symbol, 
        new_params_hash: Option<String>, 
        new_source: Option<String>,
        is_triggered: Option<bool>
    ) -> Result<(), TriggerError> {
        let trigger_key = symbol_short!("triggers");
        let mut triggers: Map<Symbol, Trigger> = env
            .storage()
            .persistent()
            .get(&trigger_key)
            .unwrap_or(Map::new(&env));

        if let Some(mut trigger) = triggers.get(id.clone()) {
            // Update params_hash if provided
            if let Some(params_hash) = new_params_hash {
                trigger.params_hash = params_hash;
            }
            
            // Update source if provided
            if let Some(source) = new_source {
                trigger.source = source;
            }
            
            // Update is_triggered if provided
            // Only allow changing from false to true, not from true to false
            if let Some(new_is_triggered) = is_triggered {
                if new_is_triggered && !trigger.is_triggered {
                    // Only allow setting to true if it's currently false
                    trigger.is_triggered = true;
                    
                    // Emit specific Triggered event if the trigger is being activated
                    env.events().publish(("TriggerEvent", "Triggered"), TriggerEvent::Triggered(id.clone(), trigger.clone()));
                } else if new_is_triggered != trigger.is_triggered {
                    // Try to set to false when it's true - return error
                    return Err(TriggerError::InvalidTriggerState);
                }
            }
            
            triggers.set(id.clone(), trigger.clone());
            env.storage().persistent().set(&trigger_key, &triggers);

            // Always emit the general Updated event
            env.events().publish(("TriggerEvent", "Updated"), TriggerEvent::Updated(id, trigger));
            Ok(())
        } else {
            Err(TriggerError::TriggerNotFound)
        }
    }
}

#[cfg(test)]
mod test;