#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, contracterror, Env, String, Map};

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
    Added(String, Trigger),
    Triggered(String, Trigger),
    Updated(String, Trigger),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum TriggerError {
    TriggerAlreadyExists = 1,
    TriggerNotFound = 2,
    InvalidTriggerState = 3,
}

#[contractimpl]
impl Contract {
    pub fn add_trigger(
        env: Env,
        id: String,
        trigger_type: String,
        phase: String,
        title: String,
        source: String,
        river_basin: String,
        params_hash: String,
        is_mandatory: bool,
    ) -> Result<(), TriggerError> {
        let trigger_key = soroban_sdk::symbol_short!("triggers");

        let mut triggers: Map<String, Trigger> = env
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

    pub fn get_trigger(env: Env, id: String) -> Option<Trigger> {
        let trigger_key = soroban_sdk::symbol_short!("triggers");
        let triggers: Map<String, Trigger> = env
            .storage()
            .persistent()
            .get(&trigger_key)
            .unwrap_or(Map::new(&env));

        triggers.get(id)
    }

    pub fn update_trigger_params(
        env: Env, 
        id: String, 
        new_params_hash: Option<String>, 
        new_source: Option<String>,
        is_triggered: Option<bool>
    ) -> Result<(), TriggerError> {
        let trigger_key = soroban_sdk::symbol_short!("triggers");
        let mut triggers: Map<String, Trigger> = env
            .storage()
            .persistent()
            .get(&trigger_key)
            .unwrap_or(Map::new(&env));

        if let Some(mut trigger) = triggers.get(id.clone()) {
            if let Some(params_hash) = new_params_hash {
                trigger.params_hash = params_hash;
            }
            
            if let Some(source) = new_source {
                trigger.source = source;
            }
            
            if let Some(new_is_triggered) = is_triggered {
                if new_is_triggered && !trigger.is_triggered {
                    trigger.is_triggered = true;
                    env.events().publish(("TriggerEvent", "Triggered"), TriggerEvent::Triggered(id.clone(), trigger.clone()));
                } else if new_is_triggered != trigger.is_triggered {
                    return Err(TriggerError::InvalidTriggerState);
                }
            }
            
            triggers.set(id.clone(), trigger.clone());
            env.storage().persistent().set(&trigger_key, &triggers);

            env.events().publish(("TriggerEvent", "Updated"), TriggerEvent::Updated(id, trigger));
            Ok(())
        } else {
            Err(TriggerError::TriggerNotFound)
        }
    }
}